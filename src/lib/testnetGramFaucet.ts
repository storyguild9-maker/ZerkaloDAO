import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  Address,
  beginCell,
  external,
  storeMessage,
  TonClient
} from "@ton/ton";
import { keyPairFromSeed, sign } from "@ton/crypto";
import {
  buildTestnetGramClaimBody,
  buildTestnetGramClaimVoucher,
  TestnetGramDistributor
} from "../../ton-contracts/wrappers/TestnetGramDistributor";
import {
  governanceSignatureDomain,
  type TonSignDataResult,
  verifyTonTextSignature
} from "@/lib/governance";
import { requirePrivateSession } from "@/lib/privatePresence";

export const TESTNET_GRAM_AMOUNT_RAW = 100_000_000_000n;
export const TESTNET_GRAM_NETWORK = "-3" as const;
const TESTNET_GRAM_LABEL = "100";
const CLAIM_CHALLENGE_TTL_SECONDS = 8 * 60;
const CLAIM_VOUCHER_TTL_SECONDS = 5 * 60;
const MIN_BROADCAST_BUFFER_RAW = 50_000_000n;

type ClaimChallengeRow = {
  id: string;
  subject_hash: string;
  wallet_address: string;
  wallet_network: string;
  challenge_text: string;
  expires_at: string;
  consumed_at: string | null;
};

type ClaimRow = {
  id: string;
  subject_hash: string;
  wallet_address: string;
  wallet_network: string;
  amount_raw: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  external_message_hash: string | null;
  valid_until: string | null;
  confirmed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type ReservedClaim = Pick<ClaimRow, "id" | "status" | "wallet_address" | "amount_raw">;

export type PublicTestnetGramStatus = {
  network: typeof TESTNET_GRAM_NETWORK;
  amount: typeof TESTNET_GRAM_LABEL;
  amountRaw: string;
  walletAddress: string;
  distributorAddress: string | null;
  distributorBalanceRaw: string;
  availableClaims: number;
  ready: boolean;
  claimed: boolean;
  state: "available" | "pending" | "submitted" | "claimed" | "unavailable";
  messageHash: string | null;
  reason: string;
};

function supabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Testnet GRAM storage is not configured");
  return { url, serviceRoleKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = supabaseConfiguration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 800);
    throw new Error(`Testnet GRAM storage request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function normalizeTestnetGramWallet(value: unknown) {
  if (typeof value !== "string" || value.length < 10 || value.length > 160) {
    throw new Error("TON-кошелёк не указан");
  }
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error("wrong workchain");
    return address.toRawString();
  } catch {
    throw new Error("Нужен корректный кошелёк базовой цепи TON");
  }
}

function requireTestnetNetwork(value: unknown) {
  if (String(value) !== TESTNET_GRAM_NETWORK) {
    throw new Error("Для выдачи 100 test GRAM переключите кошелёк на TON Testnet");
  }
  return TESTNET_GRAM_NETWORK;
}

function tonClient() {
  const endpoint = process.env.TON_TESTNET_API_ENDPOINT?.trim()
    || "https://testnet.toncenter.com/api/v2/jsonRPC";
  const apiKey = process.env.TON_TESTNET_API_KEY?.trim();
  return new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
}

function distributorAddress() {
  const configured = process.env.TON_TESTNET_DISTRIBUTOR_ADDRESS?.trim();
  if (!configured) return null;
  try {
    const address = Address.parse(configured);
    if (address.workChain !== 0) throw new Error("wrong workchain");
    return address;
  } catch {
    throw new Error("Testnet GRAM distributor address is invalid");
  }
}

function authorizerKeyPair() {
  const configured = process.env.TON_TESTNET_DISTRIBUTOR_AUTHORIZER_SEED?.trim();
  if (!configured) return null;
  const seed = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64url");
  if (seed.length !== 32) throw new Error("Testnet GRAM authorizer seed must contain 32 bytes");
  return keyPairFromSeed(seed);
}

function publicKeyAsBigInt(publicKey: Buffer) {
  return BigInt(`0x${publicKey.toString("hex")}`);
}

function subjectHashAsBigInt(subjectHash: string) {
  if (!/^[0-9a-f]{64}$/.test(subjectHash)) throw new Error("Private session subject is invalid");
  return BigInt(`0x${subjectHash}`);
}

async function findClaim(subjectHash: string, walletAddress: string) {
  const orFilter = encodeURIComponent(
    `(subject_hash.eq.${subjectHash},wallet_address.eq.${walletAddress})`
  );
  const rows = await supabaseRequest<ClaimRow[]>(
    `testnet_gram_claims?select=*&or=${orFilter}&order=created_at.desc&limit=1`
  );
  return rows?.[0] ?? null;
}

async function updateClaim(id: string, updates: Partial<Pick<ClaimRow,
  "status" | "external_message_hash" | "valid_until" | "confirmed_at" | "last_error"
>>) {
  await supabaseRequest(`testnet_gram_claims?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
  });
}

async function inspectDistributor(subjectHash: string, walletAddress: string) {
  const address = distributorAddress();
  const keys = authorizerKeyPair();
  if (!address || !keys) {
    return {
      address,
      client: null,
      contract: null,
      balance: 0n,
      reserve: 0n,
      availableClaims: 0,
      ready: false,
      subjectClaimed: false,
      walletClaimed: false,
      reason: "Раздатчик test GRAM ещё не настроен"
    };
  }

  const client = tonClient();
  const deployed = await client.isContractDeployed(address).catch(() => false);
  if (!deployed) {
    return {
      address,
      client,
      contract: null,
      balance: 0n,
      reserve: 0n,
      availableClaims: 0,
      ready: false,
      subjectClaimed: false,
      walletClaimed: false,
      reason: "Раздатчик test GRAM ожидает развёртывания"
    };
  }

  const contract = client.open(TestnetGramDistributor.createFromAddress(address));
  const [state, balance, claimStatus] = await Promise.all([
    contract.getDistributorState(),
    client.getBalance(address),
    contract.getClaimStatus(subjectHashAsBigInt(subjectHash), Address.parse(walletAddress))
  ]);
  if (state.claimAmount !== TESTNET_GRAM_AMOUNT_RAW) {
    throw new Error("Раздатчик настроен на неверную сумму");
  }
  if (state.authorizerPublicKey !== publicKeyAsBigInt(keys.publicKey)) {
    throw new Error("Ключ раздатчика не совпадает с серверным ключом");
  }
  const spendable = balance - state.minReserve - MIN_BROADCAST_BUFFER_RAW;
  const availableBigInt = spendable > 0n ? spendable / TESTNET_GRAM_AMOUNT_RAW : 0n;
  const availableClaims = Number(availableBigInt > 1_000_000n ? 1_000_000n : availableBigInt);
  return {
    address,
    client,
    contract,
    keys,
    balance,
    reserve: state.minReserve,
    availableClaims,
    ready: availableClaims > 0,
    subjectClaimed: claimStatus.subjectClaimed,
    walletClaimed: claimStatus.walletClaimed,
    reason: availableClaims > 0
      ? "100 test GRAM готовы к автоматической выдаче"
      : "Раздатчик ожидает пополнения тестовыми GRAM"
  };
}

export async function getTestnetGramStatus(token: string, input: {
  walletAddress: unknown;
  walletNetwork: unknown;
}): Promise<PublicTestnetGramStatus> {
  const session = await requirePrivateSession(token);
  const walletAddress = normalizeTestnetGramWallet(input.walletAddress);
  requireTestnetNetwork(input.walletNetwork);
  let claim = await findClaim(session.subject_hash, walletAddress);
  const distributor = await inspectDistributor(session.subject_hash, walletAddress);

  if ((distributor.subjectClaimed || distributor.walletClaimed) && claim) {
    if (claim.status !== "confirmed") {
      const confirmedAt = new Date().toISOString();
      await updateClaim(claim.id, { status: "confirmed", confirmed_at: confirmedAt, last_error: null });
      claim = { ...claim, status: "confirmed", confirmed_at: confirmedAt, last_error: null };
    }
  } else if (
    claim?.status === "submitted"
    && claim.valid_until
    && Date.parse(claim.valid_until) <= Date.now()
  ) {
    await updateClaim(claim.id, {
      status: "failed",
      last_error: "Срок внешнего сообщения истёк без подтверждения в блокчейне"
    });
    claim = { ...claim, status: "failed", last_error: "Срок подтверждения истёк" };
  }

  const exactOwner = !claim
    || (claim.subject_hash === session.subject_hash && claim.wallet_address === walletAddress);
  const claimed = distributor.subjectClaimed
    || distributor.walletClaimed
    || claim?.status === "confirmed"
    || !exactOwner;
  const state = claimed
    ? "claimed" as const
    : claim?.status === "submitted"
      ? "submitted" as const
      : claim?.status === "pending"
        ? "pending" as const
        : distributor.ready
          ? "available" as const
          : "unavailable" as const;
  const reason = !exactOwner
    ? "100 test GRAM уже были выданы этому участнику или кошельку"
    : claimed
      ? "100 test GRAM уже получены"
      : claim?.status === "submitted"
        ? "Выдача отправлена в TON Testnet и ожидает подтверждения"
        : distributor.reason;

  return {
    network: TESTNET_GRAM_NETWORK,
    amount: TESTNET_GRAM_LABEL,
    amountRaw: TESTNET_GRAM_AMOUNT_RAW.toString(),
    walletAddress,
    distributorAddress: distributor.address?.toRawString() ?? null,
    distributorBalanceRaw: distributor.balance.toString(),
    availableClaims: distributor.availableClaims,
    ready: distributor.ready && !claimed,
    claimed,
    state,
    messageHash: exactOwner ? claim?.external_message_hash ?? null : null,
    reason
  };
}

export async function createTestnetGramChallenge(token: string, input: {
  walletAddress: unknown;
  walletNetwork: unknown;
}) {
  const session = await requirePrivateSession(token);
  const walletAddress = normalizeTestnetGramWallet(input.walletAddress);
  requireTestnetNetwork(input.walletNetwork);
  const status = await getTestnetGramStatus(token, input);
  if (status.claimed) throw new Error("100 test GRAM уже были выданы этому участнику или кошельку");
  if (!status.ready) throw new Error(status.reason);

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CLAIM_CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const nonce = randomBytes(24).toString("hex");
  const challengeText = [
    "Зеркало DAO · тестовая выдача",
    "Действие: получить 100 test GRAM",
    "Сеть: TON Testnet (-3)",
    `Кошелёк: ${walletAddress}`,
    `Участник: ${session.subject_hash}`,
    `Одноразовый код: ${nonce}`,
    `Действительно до: ${expiresAt}`,
    "Подпись не переводит средства и не даёт доступ к кошельку."
  ].join("\n");

  await supabaseRequest("testnet_gram_claim_challenges", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      subject_hash: session.subject_hash,
      wallet_address: walletAddress,
      wallet_network: TESTNET_GRAM_NETWORK,
      challenge_text: challengeText,
      expires_at: expiresAt
    })
  });
  return { id, text: challengeText, expiresAt };
}

function parseSignResult(value: unknown): TonSignDataResult {
  if (!value || typeof value !== "object") throw new Error("TON-подпись не получена");
  const result = value as Partial<TonSignDataResult>;
  if (
    typeof result.signature !== "string"
    || typeof result.address !== "string"
    || typeof result.timestamp !== "number"
    || typeof result.domain !== "string"
    || result.payload?.type !== "text"
    || typeof result.payload.text !== "string"
  ) {
    throw new Error("Формат TON-подписи не поддерживается");
  }
  return result as TonSignDataResult;
}

async function loadChallenge(id: unknown, subjectHash: string) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Запрос на выдачу повреждён");
  }
  const rows = await supabaseRequest<ClaimChallengeRow[]>(
    `testnet_gram_claim_challenges?select=*&id=eq.${encodeURIComponent(id)}&subject_hash=eq.${subjectHash}&limit=1`
  );
  const challenge = rows?.[0];
  if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now()) {
    throw new Error("Запрос на выдачу истёк; создайте новый");
  }
  return challenge;
}

export async function submitTestnetGramClaim(token: string, input: {
  challengeId: unknown;
  result: unknown;
  walletStateInit: unknown;
}) {
  const session = await requirePrivateSession(token);
  const challenge = await loadChallenge(input.challengeId, session.subject_hash);
  const walletAddress = normalizeTestnetGramWallet(challenge.wallet_address);
  const result = parseSignResult(input.result);
  if (normalizeTestnetGramWallet(result.address) !== walletAddress) {
    throw new Error("Подпись принадлежит другому TON-кошельку");
  }
  if (result.payload.text !== challenge.challenge_text) {
    throw new Error("Подписан другой запрос на выдачу");
  }
  if (typeof input.walletStateInit !== "string") {
    throw new Error("Кошелёк не передал данные для проверки подписи");
  }
  if (!(await verifyTonTextSignature(result, input.walletStateInit, governanceSignatureDomain()))) {
    throw new Error("TON-подпись не прошла проверку");
  }

  const distributor = await inspectDistributor(session.subject_hash, walletAddress);
  if (distributor.subjectClaimed || distributor.walletClaimed) {
    const existing = await findClaim(session.subject_hash, walletAddress);
    if (existing) {
      await updateClaim(existing.id, {
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        last_error: null
      });
    }
    return getTestnetGramStatus(token, {
      walletAddress,
      walletNetwork: TESTNET_GRAM_NETWORK
    });
  }
  if (!distributor.ready || !distributor.address || !distributor.client || !distributor.keys) {
    throw new Error(distributor.reason);
  }

  const reserved = await supabaseRequest<ReservedClaim>("rpc/reserve_testnet_gram_claim", {
    method: "POST",
    body: JSON.stringify({
      p_challenge_id: challenge.id,
      p_subject_hash: session.subject_hash,
      p_wallet_address: walletAddress,
      p_amount_raw: TESTNET_GRAM_AMOUNT_RAW.toString()
    })
  });
  if (reserved.status === "confirmed" || reserved.status === "submitted") {
    return getTestnetGramStatus(token, {
      walletAddress,
      walletNetwork: TESTNET_GRAM_NETWORK
    });
  }

  const validUntil = Math.floor(Date.now() / 1000) + CLAIM_VOUCHER_TTL_SECONDS;
  const voucher = buildTestnetGramClaimVoucher({
    validUntil,
    distributorAddress: distributor.address,
    recipientAddress: Address.parse(walletAddress),
    subjectHash: subjectHashAsBigInt(session.subject_hash)
  });
  const body = buildTestnetGramClaimBody(
    voucher,
    sign(voucher.hash(), distributor.keys.secretKey)
  );
  const message = external({ to: distributor.address, body });
  const messageCell = beginCell().store(storeMessage(message)).endCell();
  const messageHash = messageCell.hash().toString("hex");
  const validUntilIso = new Date(validUntil * 1000).toISOString();
  await updateClaim(reserved.id, {
    status: "submitted",
    external_message_hash: messageHash,
    valid_until: validUntilIso,
    last_error: null
  });

  try {
    await distributor.client.sendFile(messageCell.toBoc());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Неизвестная ошибка отправки";
    await updateClaim(reserved.id, {
      last_error: `Статус отправки требует проверки: ${detail.slice(0, 420)}`
    });
  }

  return getTestnetGramStatus(token, {
    walletAddress,
    walletNetwork: TESTNET_GRAM_NETWORK
  });
}
