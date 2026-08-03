import { createHmac, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  Address,
  Cell,
  contractAddress,
  loadStateInit,
  type Slice,
  type StateInit,
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4 as WalletContractV4R2,
  WalletContractV5R1
} from "@ton/ton";
import { sha256 } from "@ton/crypto";
import nacl from "tweetnacl";
import { createTelegramSubjectHash, requirePrivateSession, type PrivateSessionRow } from "@/lib/privatePresence";
import { parseTelegramAllowedUserIds } from "@/lib/telegramAccess";

const PROPOSAL_LIMIT = 30;
const CHALLENGE_TTL_SECONDS = 8 * 60;
const SIGNATURE_MAX_AGE_SECONDS = 15 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GovernanceProposalRow = {
  id: string;
  title: string;
  description: string;
  options: unknown;
  quorum: number;
  status: "open" | "closed" | "cancelled";
  created_at: string;
  closes_at: string;
  closed_at: string | null;
};

type GovernanceVoteRow = {
  proposal_id: string;
  voter_key: string;
  choice: string;
};

type GovernanceChallengeRow = {
  id: string;
  proposal_id: string;
  voter_key: string;
  choice: string;
  wallet_address: string;
  wallet_network: string;
  challenge_text: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export type PublicGovernanceProposal = {
  id: string;
  title: string;
  description: string;
  options: string[];
  quorum: number;
  status: "open" | "closed" | "cancelled";
  createdAt: string;
  closesAt: string;
  totalVotes: number;
  quorumReached: boolean;
  myChoice: string | null;
  results: Array<{ choice: string; count: number }>;
};

export type TonSignDataResult = {
  signature: string;
  address: string;
  timestamp: number;
  domain: string;
  payload: { type: "text"; text: string };
  traceId?: string;
};

function supabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Governance storage is not configured");
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
    const detail = await response.text().catch(() => "");
    throw new Error(`Governance storage request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function sessionSecret() {
  const secret = process.env.TELEGRAM_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Governance authorization is not configured");
  return secret;
}

function governanceAdminIds() {
  return parseTelegramAllowedUserIds(
    process.env.TELEGRAM_GOVERNANCE_ADMIN_IDS ?? process.env.TELEGRAM_ALLOWED_USER_IDS
  );
}

export function isGovernanceAdminSubjectHash(subjectHash: string) {
  const secret = sessionSecret();
  for (const telegramUserId of governanceAdminIds()) {
    if (createTelegramSubjectHash(telegramUserId, secret) === subjectHash) return true;
  }
  return false;
}

export function createGovernanceVoterKey(subjectHash: string, proposalId: string) {
  return createHmac("sha256", sessionSecret())
    .update(`governance-vote:${proposalId}:${subjectHash}`)
    .digest("hex");
}

function assertGovernanceAdmin(session: PrivateSessionRow) {
  if (!isGovernanceAdminSubjectHash(session.subject_hash)) {
    throw new Error("Недостаточно прав для управления голосованиями");
  }
}

function normalizeProposalId(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("Голосование не найдено");
  return value.toLowerCase();
}

function normalizeSingleLine(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new Error(`Введите ${label.toLowerCase()}`);
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} должно содержать от ${minimum} до ${maximum} символов`);
  }
  return normalized;
}

export function normalizeGovernanceOptions(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Добавьте варианты ответа");
  const options = value.map((option) => normalizeSingleLine(option, "Вариант", 1, 80));
  if (options.length < 2 || options.length > 6) throw new Error("Добавьте от 2 до 6 вариантов ответа");
  if (new Set(options.map((option) => option.toLocaleLowerCase("ru-RU"))).size !== options.length) {
    throw new Error("Варианты ответа не должны повторяться");
  }
  return options;
}

function normalizeDescription(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error("Описание имеет неверный формат");
  const description = value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (description.length > 2000) throw new Error("Описание должно быть не длиннее 2000 символов");
  return description;
}

function parseStoredOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((option): option is string => typeof option === "string");
}

function normalizeWalletAddress(value: unknown) {
  if (typeof value !== "string" || value.length > 160) throw new Error("Адрес кошелька не распознан");
  try {
    return Address.parse(value).toRawString();
  } catch {
    throw new Error("Адрес кошелька не распознан");
  }
}

function normalizeWalletNetwork(value: unknown) {
  const network = String(value ?? "");
  if (network !== "-239" && network !== "-3") throw new Error("Сеть TON не поддерживается");
  return network;
}

export function governanceSignatureDomain() {
  const configured = process.env.TON_SIGN_DATA_DOMAIN?.trim();
  if (configured) return configured.toLowerCase();
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (appUrl) return new URL(appUrl).host.toLowerCase();
  } catch {
    // Fall through to the stable production alias.
  }
  return "zerkalo-dao.vercel.app";
}

function loadV1(slice: Slice) { slice.loadUint(32); return slice.loadBuffer(32); }
function loadV2(slice: Slice) { slice.loadUint(32); return slice.loadBuffer(32); }
function loadV3(slice: Slice) { slice.loadUint(32); slice.loadUint(32); return slice.loadBuffer(32); }
function loadV4(slice: Slice) { slice.loadUint(32); slice.loadUint(32); return slice.loadBuffer(32); }
function loadV5(slice: Slice) { slice.loadBoolean(); slice.loadUint(32); slice.loadUint(32); return slice.loadBuffer(32); }

const KNOWN_WALLETS = [
  { contract: WalletContractV1R1, load: loadV1 },
  { contract: WalletContractV1R2, load: loadV1 },
  { contract: WalletContractV1R3, load: loadV1 },
  { contract: WalletContractV2R1, load: loadV2 },
  { contract: WalletContractV2R2, load: loadV2 },
  { contract: WalletContractV3R1, load: loadV3 },
  { contract: WalletContractV3R2, load: loadV3 },
  { contract: WalletContractV4R2, load: loadV4 },
  { contract: WalletContractV5R1, load: loadV5 }
].map(({ contract, load }) => ({
  code: contract.create({ workchain: 0, publicKey: Buffer.alloc(32) }).init.code,
  load
}));

export function tryExtractWalletPublicKey(stateInit: StateInit) {
  if (!stateInit.code || !stateInit.data) return null;
  for (const wallet of KNOWN_WALLETS) {
    try {
      if (wallet.code.equals(stateInit.code)) return wallet.load(stateInit.data.beginParse());
    } catch {
      // Unknown data layout. Continue with the next standard wallet contract.
    }
  }
  return null;
}

export async function verifyTonTextSignature(
  result: TonSignDataResult,
  walletStateInit: string,
  expectedDomain = governanceSignatureDomain()
) {
  if (result.domain.toLowerCase() !== expectedDomain.toLowerCase()) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(result.timestamp) || Math.abs(now - result.timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }
  if (result.payload?.type !== "text" || typeof result.payload.text !== "string") return false;
  if (typeof walletStateInit !== "string" || walletStateInit.length < 16 || walletStateInit.length > 20000) return false;

  try {
    const address = Address.parse(result.address);
    const stateInit = loadStateInit(Cell.fromBase64(walletStateInit).beginParse());
    if (!contractAddress(address.workChain, stateInit).equals(address)) return false;
    const publicKey = tryExtractWalletPublicKey(stateInit);
    if (!publicKey) return false;

    const workchain = Buffer.alloc(4);
    workchain.writeInt32BE(address.workChain);
    const domain = Buffer.from(result.domain, "utf8");
    const domainLength = Buffer.alloc(4);
    domainLength.writeUInt32BE(domain.length);
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(result.timestamp));
    const data = Buffer.from(result.payload.text, "utf8");
    const dataLength = Buffer.alloc(4);
    dataLength.writeUInt32BE(data.length);
    const message = Buffer.concat([
      Buffer.from([0xff, 0xff]),
      Buffer.from("ton-connect/sign-data/"),
      workchain,
      address.hash,
      domainLength,
      domain,
      timestamp,
      Buffer.from("txt"),
      dataLength,
      data
    ]);
    const digest = await sha256(message);
    return nacl.sign.detached.verify(
      new Uint8Array(digest),
      new Uint8Array(Buffer.from(result.signature, "base64")),
      new Uint8Array(publicKey)
    );
  } catch {
    return false;
  }
}

function effectiveStatus(proposal: GovernanceProposalRow) {
  return proposal.status === "open" && Date.parse(proposal.closes_at) <= Date.now()
    ? "closed" as const
    : proposal.status;
}

export async function listGovernanceProposals(token: string) {
  const session = await requirePrivateSession(token);
  const proposals = await supabaseRequest<GovernanceProposalRow[]>(
    `governance_proposals?select=id,title,description,options,quorum,status,created_at,closes_at,closed_at&order=created_at.desc&limit=${PROPOSAL_LIMIT}`
  );
  const proposalIds = (proposals ?? []).map((proposal) => proposal.id);
  const votes = proposalIds.length
    ? await supabaseRequest<GovernanceVoteRow[]>(
        `governance_votes?select=proposal_id,voter_key,choice&proposal_id=in.(${proposalIds.join(",")})`
      )
    : [];

  const publicProposals: PublicGovernanceProposal[] = (proposals ?? []).map((proposal) => {
    const options = parseStoredOptions(proposal.options);
    const voterKey = createGovernanceVoterKey(session.subject_hash, proposal.id);
    const proposalVotes = (votes ?? []).filter((vote) => vote.proposal_id === proposal.id);
    return {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      options,
      quorum: proposal.quorum,
      status: effectiveStatus(proposal),
      createdAt: proposal.created_at,
      closesAt: proposal.closes_at,
      totalVotes: proposalVotes.length,
      quorumReached: proposalVotes.length >= proposal.quorum,
      myChoice: proposalVotes.find((vote) => vote.voter_key === voterKey)?.choice ?? null,
      results: options.map((choice) => ({
        choice,
        count: proposalVotes.filter((vote) => vote.choice === choice).length
      }))
    };
  });

  return { proposals: publicProposals, canManage: isGovernanceAdminSubjectHash(session.subject_hash) };
}

export async function createGovernanceProposal(token: string, input: {
  title?: unknown;
  description?: unknown;
  options?: unknown;
  quorum?: unknown;
  durationHours?: unknown;
}) {
  const session = await requirePrivateSession(token);
  assertGovernanceAdmin(session);
  const title = normalizeSingleLine(input.title, "Название", 3, 120);
  const description = normalizeDescription(input.description);
  const options = normalizeGovernanceOptions(input.options);
  const quorum = Number(input.quorum);
  const durationHours = Number(input.durationHours);
  if (!Number.isSafeInteger(quorum) || quorum < 1 || quorum > 1_000_000) throw new Error("Кворум имеет неверное значение");
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720) throw new Error("Срок должен быть от 1 до 720 часов");
  const closesAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRequest<GovernanceProposalRow[]>(
    "governance_proposals?select=id,title,description,options,quorum,status,created_at,closes_at,closed_at",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title, description, options, quorum, closes_at: closesAt })
    }
  );
  if (!rows?.[0]) throw new Error("Голосование не было создано");
  return rows[0];
}

export async function closeGovernanceProposal(token: string, proposalIdValue: unknown) {
  const session = await requirePrivateSession(token);
  assertGovernanceAdmin(session);
  const proposalId = normalizeProposalId(proposalIdValue);
  const rows = await supabaseRequest<GovernanceProposalRow[]>(
    `governance_proposals?id=eq.${proposalId}&status=eq.open&select=id,title,description,options,quorum,status,created_at,closes_at,closed_at`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() })
    }
  );
  if (!rows?.[0]) throw new Error("Открытое голосование не найдено");
  return rows[0];
}

export async function createGovernanceVoteChallenge(token: string, input: {
  proposalId?: unknown;
  choice?: unknown;
  walletAddress?: unknown;
  walletNetwork?: unknown;
}) {
  const session = await requirePrivateSession(token);
  const proposalId = normalizeProposalId(input.proposalId);
  const choice = normalizeSingleLine(input.choice, "Вариант", 1, 80);
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const walletNetwork = normalizeWalletNetwork(input.walletNetwork);
  const proposalRows = await supabaseRequest<GovernanceProposalRow[]>(
    `governance_proposals?select=id,title,description,options,quorum,status,created_at,closes_at,closed_at&id=eq.${proposalId}&limit=1`
  );
  const proposal = proposalRows?.[0];
  if (!proposal || effectiveStatus(proposal) !== "open") throw new Error("Голосование уже закрыто");
  const options = parseStoredOptions(proposal.options);
  if (!options.includes(choice)) throw new Error("Выбранный вариант не существует");

  const voterKey = createGovernanceVoterKey(session.subject_hash, proposalId);
  const existingVotes = await supabaseRequest<Array<{ id: string }>>(
    `governance_votes?select=id&proposal_id=eq.${proposalId}&or=(voter_key.eq.${voterKey},wallet_address.eq.${encodeURIComponent(walletAddress)})&limit=1`
  );
  if (existingVotes?.[0]) throw new Error("Голос уже подтверждён");

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const challengeText = [
    "ЗЕРКАЛО ДАО — ГОЛОСОВАНИЕ",
    `Предложение: ${proposal.title}`,
    `Решение: ${choice}`,
    `ID предложения: ${proposal.id}`,
    `Одноразовый код: ${nonce}`,
    `Действительно до: ${expiresAt}`
  ].join("\n");
  const rows = await supabaseRequest<GovernanceChallengeRow[]>(
    "governance_vote_challenges?select=id,proposal_id,voter_key,choice,wallet_address,wallet_network,challenge_text,created_at,expires_at,consumed_at",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        proposal_id: proposalId,
        voter_key: voterKey,
        choice,
        wallet_address: walletAddress,
        wallet_network: walletNetwork,
        challenge_text: challengeText,
        expires_at: expiresAt
      })
    }
  );
  const challenge = rows?.[0];
  if (!challenge) throw new Error("Не удалось подготовить подпись");
  return { id: challenge.id, text: challenge.challenge_text, expiresAt: challenge.expires_at };
}

function parseTonSignDataResult(value: unknown): TonSignDataResult {
  if (!value || typeof value !== "object") throw new Error("Подпись кошелька не распознана");
  const candidate = value as Partial<TonSignDataResult>;
  if (
    typeof candidate.signature !== "string"
    || typeof candidate.address !== "string"
    || !Number.isSafeInteger(candidate.timestamp)
    || typeof candidate.domain !== "string"
    || !candidate.payload
    || candidate.payload.type !== "text"
    || typeof candidate.payload.text !== "string"
  ) {
    throw new Error("Подпись кошелька не распознана");
  }
  return candidate as TonSignDataResult;
}

export async function castGovernanceVote(token: string, input: {
  challengeId?: unknown;
  result?: unknown;
  walletStateInit?: unknown;
}) {
  const session = await requirePrivateSession(token);
  const challengeId = normalizeProposalId(input.challengeId);
  const result = parseTonSignDataResult(input.result);
  if (typeof input.walletStateInit !== "string") throw new Error("Кошелёк не передал данные для проверки подписи");
  const challengeRows = await supabaseRequest<GovernanceChallengeRow[]>(
    `governance_vote_challenges?select=id,proposal_id,voter_key,choice,wallet_address,wallet_network,challenge_text,created_at,expires_at,consumed_at&id=eq.${challengeId}&limit=1`
  );
  const challenge = challengeRows?.[0];
  if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now()) {
    throw new Error("Срок подтверждения истёк. Выберите вариант ещё раз");
  }
  const expectedVoterKey = createGovernanceVoterKey(session.subject_hash, challenge.proposal_id);
  if (challenge.voter_key !== expectedVoterKey) throw new Error("Подпись относится к другой сессии");
  if (result.payload.text !== challenge.challenge_text) throw new Error("Текст подписанного решения изменён");
  if (normalizeWalletAddress(result.address) !== challenge.wallet_address) throw new Error("Подпись сделана другим кошельком");
  if (!(await verifyTonTextSignature(result, input.walletStateInit))) {
    throw new Error("TON-подпись не прошла криптографическую проверку");
  }

  await supabaseRequest("rpc/cast_governance_vote", {
    method: "POST",
    body: JSON.stringify({
      p_challenge_id: challenge.id,
      p_voter_key: expectedVoterKey,
      p_signature: result.signature,
      p_signature_domain: result.domain,
      p_signed_at: new Date(result.timestamp * 1000).toISOString()
    })
  });
  return { proposalId: challenge.proposal_id, choice: challenge.choice };
}
