import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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
const VAULT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;
const FINANCIAL_OPTIONS = ["За", "Против", "Воздержаться"] as const;

export type FinancialActionType =
  | "stake"
  | "unstake"
  | "allocate"
  | "withdraw"
  | "external_transfer"
  | "policy_change";

type FinancialRule = {
  capitalQuorumBps: number;
  approvalThresholdBps: number;
  memberQuorum: number;
};

const FINANCIAL_RULES: Record<FinancialActionType, FinancialRule> = {
  stake: { capitalQuorumBps: 5000, approvalThresholdBps: 5001, memberQuorum: 1 },
  unstake: { capitalQuorumBps: 5000, approvalThresholdBps: 5001, memberQuorum: 1 },
  allocate: { capitalQuorumBps: 6000, approvalThresholdBps: 6000, memberQuorum: 2 },
  withdraw: { capitalQuorumBps: 6000, approvalThresholdBps: 6000, memberQuorum: 2 },
  external_transfer: { capitalQuorumBps: 6700, approvalThresholdBps: 6667, memberQuorum: 2 },
  policy_change: { capitalQuorumBps: 7500, approvalThresholdBps: 7500, memberQuorum: 2 }
};

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
  kind: "standard" | "financial";
  fund_vault_slug: string | null;
  snapshot_total_share_units: string | null;
  capital_quorum_bps: number | null;
  approval_threshold_bps: number | null;
  decision_status: "pending" | "completed" | "approved" | "rejected" | "cancelled";
  winning_choice: string | null;
  finalized_at: string | null;
  action_type: FinancialActionType | null;
  amount_raw: string | null;
  destination: string | null;
  action_hash: string | null;
};

type GovernanceVoteRow = {
  proposal_id: string;
  voter_key: string;
  choice: string;
  weight_units: string;
};

type GovernanceSnapshotRow = {
  proposal_id: string;
  voter_key: string;
  share_units: string;
};

type GovernanceState = {
  proposals: GovernanceProposalRow[];
  votes: GovernanceVoteRow[];
  snapshots: GovernanceSnapshotRow[];
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

type FundVaultRow = {
  slug: string;
  display_name: string;
  asset_symbol: string;
  asset_decimals: number;
  network: "-239" | "-3";
  status: "active" | "paused" | "closed";
  total_share_units: string;
  my_share_units: string;
};

type FundShareSnapshot = {
  vault: Omit<FundVaultRow, "my_share_units">;
  balances: Array<{ subject_hash: string; share_units: string }>;
};

export type PublicFundVault = {
  slug: string;
  displayName: string;
  assetSymbol: string;
  assetDecimals: number;
  network: "-239" | "-3";
  status: "active" | "paused" | "closed";
  totalShareUnits: string;
  myShareUnits: string;
  myShareBps: number;
};

export type PublicGovernanceProposal = {
  id: string;
  title: string;
  description: string;
  options: string[];
  quorum: number;
  kind: "standard" | "financial";
  status: "open" | "closed" | "cancelled";
  decisionStatus: "pending" | "completed" | "approved" | "rejected" | "cancelled";
  winningChoice: string | null;
  createdAt: string;
  closesAt: string;
  totalVotes: number;
  quorumReached: boolean;
  myChoice: string | null;
  results: Array<{ choice: string; count: number; weightUnits: string; percentBps: number }>;
  financial: null | {
    vaultSlug: string;
    vaultName: string;
    assetSymbol: string;
    assetDecimals: number;
    actionType: FinancialActionType;
    amountRaw: string | null;
    destination: string;
    actionHash: string;
    snapshotTotalShareUnits: string;
    myShareUnits: string;
    myShareBps: number;
    participatingShareUnits: string;
    participationBps: number;
    capitalQuorumBps: number;
    approvalBps: number;
    approvalThresholdBps: number;
  };
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

function normalizeOptionalSingleLine(value: unknown, label: string, maximum: number) {
  if (value === undefined || value === null || value === "") return "";
  return normalizeSingleLine(value, label, 1, maximum);
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
  return network as "-239" | "-3";
}

function normalizeVaultSlug(value: unknown) {
  if (typeof value !== "string" || !VAULT_SLUG_PATTERN.test(value)) throw new Error("Фонд не найден");
  return value;
}

function normalizeFinancialActionType(value: unknown): FinancialActionType {
  if (typeof value !== "string" || !(value in FINANCIAL_RULES)) {
    throw new Error("Тип финансового решения не поддерживается");
  }
  return value as FinancialActionType;
}

export function financialGovernanceRule(actionType: FinancialActionType) {
  return { ...FINANCIAL_RULES[actionType] };
}

export function parseAssetAmountToRaw(value: unknown, decimals: number) {
  if (typeof value !== "string") throw new Error("Введите сумму");
  const normalized = value.trim().replace(",", ".");
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{1,${decimals}}))?$`);
  const match = normalized.match(pattern);
  if (!match) throw new Error(`Сумма должна содержать не более ${decimals} знаков после запятой`);
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}

function parseIntegerUnits(value: unknown) {
  const normalized = String(value ?? "");
  if (!/^\d+$/.test(normalized)) throw new Error("Повреждены данные о долях фонда");
  return BigInt(normalized);
}

export function calculateBasisPoints(part: bigint, total: bigint) {
  if (part <= 0n || total <= 0n) return 0;
  const result = Number((part * 10000n) / total);
  return Math.max(0, Math.min(10000, result));
}

function sumUnits(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function formatBasisPoints(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
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

async function readGovernanceState() {
  const state = await supabaseRequest<GovernanceState>("rpc/read_governance_state", {
    method: "POST",
    body: JSON.stringify({ p_limit: PROPOSAL_LIMIT })
  });
  return {
    proposals: Array.isArray(state?.proposals) ? state.proposals : [],
    votes: Array.isArray(state?.votes) ? state.votes : [],
    snapshots: Array.isArray(state?.snapshots) ? state.snapshots : []
  };
}

async function finalizeExpiredProposals(state: GovernanceState) {
  const expired = state.proposals.filter(
    (proposal) => proposal.status === "open" && Date.parse(proposal.closes_at) <= Date.now()
  );
  if (!expired.length) return state;
  await Promise.allSettled(expired.map((proposal) => supabaseRequest("rpc/finalize_governance_proposal", {
    method: "POST",
    body: JSON.stringify({ p_proposal_id: proposal.id, p_force: false })
  })));
  return readGovernanceState();
}

export async function listGovernanceProposals(token: string) {
  const session = await requirePrivateSession(token);
  const state = await finalizeExpiredProposals(await readGovernanceState());
  const fundRows = await supabaseRequest<FundVaultRow[]>("rpc/read_fund_vaults", {
    method: "POST",
    body: JSON.stringify({ p_subject_hash: session.subject_hash })
  });
  const funds: PublicFundVault[] = (Array.isArray(fundRows) ? fundRows : []).map((fund) => {
    const total = parseIntegerUnits(fund.total_share_units);
    const mine = parseIntegerUnits(fund.my_share_units);
    return {
      slug: fund.slug,
      displayName: fund.display_name,
      assetSymbol: fund.asset_symbol,
      assetDecimals: fund.asset_decimals,
      network: fund.network,
      status: fund.status,
      totalShareUnits: total.toString(),
      myShareUnits: mine.toString(),
      myShareBps: calculateBasisPoints(mine, total)
    };
  });
  const fundMap = new Map(funds.map((fund) => [fund.slug, fund]));

  const proposals: PublicGovernanceProposal[] = state.proposals.map((proposal) => {
    const options = parseStoredOptions(proposal.options);
    const voterKey = createGovernanceVoterKey(session.subject_hash, proposal.id);
    const votes = state.votes.filter((vote) => vote.proposal_id === proposal.id);
    const snapshot = state.snapshots.find(
      (entry) => entry.proposal_id === proposal.id && entry.voter_key === voterKey
    );
    const totalShares = proposal.kind === "financial"
      ? parseIntegerUnits(proposal.snapshot_total_share_units)
      : BigInt(votes.length);
    const participatingShares = proposal.kind === "financial"
      ? sumUnits(votes.map((vote) => parseIntegerUnits(vote.weight_units)))
      : BigInt(votes.length);
    const resultRows = options.map((choice) => {
      const choiceVotes = votes.filter((vote) => vote.choice === choice);
      const weight = proposal.kind === "financial"
        ? sumUnits(choiceVotes.map((vote) => parseIntegerUnits(vote.weight_units)))
        : BigInt(choiceVotes.length);
      return {
        choice,
        count: choiceVotes.length,
        weightUnits: weight.toString(),
        percentBps: calculateBasisPoints(weight, totalShares)
      };
    });
    const participationBps = calculateBasisPoints(participatingShares, totalShares);
    const yesWeight = parseIntegerUnits(resultRows[0]?.weightUnits ?? "0");
    const noWeight = parseIntegerUnits(resultRows[1]?.weightUnits ?? "0");
    const approvalBps = calculateBasisPoints(yesWeight, yesWeight + noWeight);
    const capitalQuorumBps = proposal.capital_quorum_bps ?? 0;
    const quorumReached = proposal.kind === "financial"
      ? votes.length >= proposal.quorum && participationBps >= capitalQuorumBps
      : votes.length >= proposal.quorum;
    const fund = proposal.fund_vault_slug ? fundMap.get(proposal.fund_vault_slug) : undefined;
    const myShare = snapshot ? parseIntegerUnits(snapshot.share_units) : 0n;

    return {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      options,
      quorum: proposal.quorum,
      kind: proposal.kind,
      status: effectiveStatus(proposal),
      decisionStatus: proposal.decision_status,
      winningChoice: proposal.winning_choice,
      createdAt: proposal.created_at,
      closesAt: proposal.closes_at,
      totalVotes: votes.length,
      quorumReached,
      myChoice: votes.find((vote) => vote.voter_key === voterKey)?.choice ?? null,
      results: resultRows,
      financial: proposal.kind === "financial" && proposal.fund_vault_slug && proposal.action_type && proposal.action_hash
        ? {
            vaultSlug: proposal.fund_vault_slug,
            vaultName: fund?.displayName ?? proposal.fund_vault_slug,
            assetSymbol: fund?.assetSymbol ?? "TON",
            assetDecimals: fund?.assetDecimals ?? 9,
            actionType: proposal.action_type,
            amountRaw: proposal.amount_raw,
            destination: proposal.destination ?? "",
            actionHash: proposal.action_hash,
            snapshotTotalShareUnits: totalShares.toString(),
            myShareUnits: myShare.toString(),
            myShareBps: calculateBasisPoints(myShare, totalShares),
            participatingShareUnits: participatingShares.toString(),
            participationBps,
            capitalQuorumBps,
            approvalBps,
            approvalThresholdBps: proposal.approval_threshold_bps ?? 0
          }
        : null
    };
  });

  return {
    proposals,
    funds,
    canManage: isGovernanceAdminSubjectHash(session.subject_hash)
  };
}

export async function createGovernanceProposal(token: string, input: {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  options?: unknown;
  quorum?: unknown;
  durationHours?: unknown;
  fundVaultSlug?: unknown;
  financialActionType?: unknown;
  amount?: unknown;
  destination?: unknown;
}) {
  const session = await requirePrivateSession(token);
  assertGovernanceAdmin(session);
  const title = normalizeSingleLine(input.title, "Название", 3, 120);
  const description = normalizeDescription(input.description);
  const durationHours = Number(input.durationHours);
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720) {
    throw new Error("Срок должен быть от 1 до 720 часов");
  }
  const closesAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const kind = input.kind === "financial" ? "financial" : input.kind === undefined || input.kind === "standard"
    ? "standard"
    : null;
  if (!kind) throw new Error("Тип голосования не поддерживается");

  if (kind === "standard") {
    const options = normalizeGovernanceOptions(input.options);
    const quorum = Number(input.quorum);
    if (!Number.isSafeInteger(quorum) || quorum < 1 || quorum > 1_000_000) {
      throw new Error("Кворум имеет неверное значение");
    }
    const rows = await supabaseRequest<GovernanceProposalRow[]>(
      "governance_proposals?select=id,title,description,options,quorum,status,created_at,closes_at,closed_at,kind,fund_vault_slug,snapshot_total_share_units,capital_quorum_bps,approval_threshold_bps,decision_status,winning_choice,finalized_at",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ title, description, options, quorum, closes_at: closesAt, kind: "standard" })
      }
    );
    if (!rows?.[0]) throw new Error("Голосование не было создано");
    return rows[0];
  }

  const proposalId = randomUUID();
  const vaultSlug = normalizeVaultSlug(input.fundVaultSlug);
  const actionType = normalizeFinancialActionType(input.financialActionType);
  const rule = FINANCIAL_RULES[actionType];
  const snapshot = await supabaseRequest<FundShareSnapshot | null>("rpc/read_fund_share_snapshot", {
    method: "POST",
    body: JSON.stringify({ p_vault_slug: vaultSlug })
  });
  if (!snapshot?.vault || snapshot.vault.status !== "active") throw new Error("Фонд не найден или временно приостановлен");
  const balances = (Array.isArray(snapshot.balances) ? snapshot.balances : []).map((balance) => ({
    subject_hash: balance.subject_hash,
    share_units: parseIntegerUnits(balance.share_units).toString()
  })).filter((balance) => BigInt(balance.share_units) > 0n);
  if (!balances.length) throw new Error("В фонде пока нет подтверждённых долей для голосования");
  if (balances.length < rule.memberQuorum) {
    throw new Error(`Для этого решения требуется не менее ${rule.memberQuorum} участников фонда`);
  }
  const balanceTotal = sumUnits(balances.map((balance) => BigInt(balance.share_units)));
  if (balanceTotal !== parseIntegerUnits(snapshot.vault.total_share_units)) {
    throw new Error("Реестр долей фонда требует сверки перед голосованием");
  }

  const amountRaw = actionType === "policy_change"
    ? null
    : parseAssetAmountToRaw(input.amount, snapshot.vault.asset_decimals);
  if (amountRaw !== null && amountRaw <= 0n) throw new Error("Сумма финансового решения должна быть больше нуля");
  let destination = normalizeOptionalSingleLine(input.destination, "Назначение", 240);
  if (!destination && actionType === "stake") destination = "Tonstakers / tsTON";
  if (!destination && actionType !== "policy_change") throw new Error("Укажите назначение средств");

  const actionPayload = {
    version: 1,
    network: snapshot.vault.network,
    proposalId,
    vaultSlug,
    assetSymbol: snapshot.vault.asset_symbol,
    actionType,
    amountRaw: amountRaw?.toString() ?? null,
    destination
  };
  const actionHash = createHash("sha256").update(JSON.stringify(actionPayload)).digest("hex");
  const snapshots = balances.map((balance) => ({
    subject_hash: balance.subject_hash,
    voter_key: createGovernanceVoterKey(balance.subject_hash, proposalId),
    share_units: balance.share_units
  }));

  await supabaseRequest("rpc/create_financial_governance_proposal", {
    method: "POST",
    body: JSON.stringify({
      p_proposal_id: proposalId,
      p_title: title,
      p_description: description,
      p_member_quorum: rule.memberQuorum,
      p_closes_at: closesAt,
      p_vault_slug: vaultSlug,
      p_capital_quorum_bps: rule.capitalQuorumBps,
      p_approval_threshold_bps: rule.approvalThresholdBps,
      p_action_type: actionType,
      p_amount_raw: amountRaw?.toString() ?? null,
      p_destination: destination,
      p_action_payload: actionPayload,
      p_action_hash: actionHash,
      p_snapshots: snapshots
    })
  });
  return { id: proposalId, kind: "financial" as const, actionHash };
}

export async function closeGovernanceProposal(token: string, proposalIdValue: unknown) {
  const session = await requirePrivateSession(token);
  assertGovernanceAdmin(session);
  const proposalId = normalizeProposalId(proposalIdValue);
  return supabaseRequest("rpc/finalize_governance_proposal", {
    method: "POST",
    body: JSON.stringify({ p_proposal_id: proposalId, p_force: true })
  });
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
  const proposalRows = await supabaseRequest<Array<Pick<GovernanceProposalRow,
    "id" | "title" | "description" | "options" | "quorum" | "status" | "created_at" | "closes_at" |
    "closed_at" | "kind" | "fund_vault_slug">>>(
    `governance_proposals?select=id,title,description,options,quorum,status,created_at,closes_at,closed_at,kind,fund_vault_slug&id=eq.${proposalId}&limit=1`
  );
  const proposal = proposalRows?.[0] as GovernanceProposalRow | undefined;
  if (!proposal || effectiveStatus(proposal) !== "open") throw new Error("Голосование уже закрыто");
  const options = parseStoredOptions(proposal.options);
  if (!options.includes(choice)) throw new Error("Выбранный вариант не существует");

  const voterKey = createGovernanceVoterKey(session.subject_hash, proposalId);
  const existingVotes = await supabaseRequest<Array<{ id: string }>>(
    `governance_votes?select=id&proposal_id=eq.${proposalId}&or=(voter_key.eq.${voterKey},wallet_address.eq.${encodeURIComponent(walletAddress)})&limit=1`
  );
  if (existingVotes?.[0]) throw new Error("Голос уже подтверждён");

  let financialLines: string[] = [];
  if (proposal.kind === "financial") {
    const state = await readGovernanceState();
    const storedProposal = state.proposals.find((entry) => entry.id === proposalId);
    const storedSnapshot = state.snapshots.find(
      (entry) => entry.proposal_id === proposalId && entry.voter_key === voterKey
    );
    if (!storedProposal?.action_hash || !storedSnapshot || !storedProposal.snapshot_total_share_units) {
      throw new Error("На момент открытия голосования у вас не было доли в фонде");
    }
    const vaultRows = await supabaseRequest<Array<{ network: "-239" | "-3" }>>(
      `fund_vaults?select=network&slug=eq.${encodeURIComponent(proposal.fund_vault_slug ?? "")}&limit=1`
    );
    if (!vaultRows?.[0] || vaultRows[0].network !== walletNetwork) {
      throw new Error("Для финансового решения подключите кошелёк нужной сети TON");
    }
    const shareBps = calculateBasisPoints(
      parseIntegerUnits(storedSnapshot.share_units),
      parseIntegerUnits(storedProposal.snapshot_total_share_units)
    );
    financialLines = [
      `Вес голоса: ${formatBasisPoints(shareBps)}% капитала`,
      `Хэш финансового действия: ${storedProposal.action_hash}`
    ];
  }

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const challengeText = [
    "ЗЕРКАЛО ДАО — ГОЛОСОВАНИЕ",
    `Предложение: ${proposal.title}`,
    `Решение: ${choice}`,
    ...financialLines,
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
