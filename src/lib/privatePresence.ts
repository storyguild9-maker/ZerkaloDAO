import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { getTelegramAvatarId } from "@/lib/telegramScene";

const SESSION_TTL_HOURS = 12;
const ACTIVE_WINDOW_SECONDS = 120;
const ROOM_KEY = "temple-main";
const CHAT_HISTORY_LIMIT = 80;
const CHAT_MESSAGE_LIMIT = 500;
const CHAT_RATE_WINDOW_SECONDS = 10;
const CHAT_RATE_LIMIT = 5;

export type PrivatePresenceSession = {
  participantId: string;
  token: string;
  nickname: string;
  avatarId: string;
  expiresAt: string;
};

export type PublicPresence = {
  participantId: string;
  nickname: string;
  avatarId: string;
  position: [number, number, number];
  rotationY: number;
  animation: string;
  lastSeenAt: string;
};

export type PublicChatMessage = {
  id: string;
  nickname: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

type PrivateSessionRow = {
  participant_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type PresenceRow = {
  participant_id: string;
  nickname: string;
  avatar_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
  animation: string;
  last_seen_at: string;
};

type ChatRow = {
  id: string;
  participant_id: string;
  nickname_snapshot: string;
  body: string;
  created_at: string;
};

function supabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Presence storage is not configured");
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
  if (!response.ok) throw new Error(`Presence storage request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createTelegramSubjectHash(telegramUserId: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`telegram-webapp:${telegramUserId}`)
    .digest("hex");
}

export function normalizeSessionNickname(value: unknown) {
  if (typeof value !== "string") throw new Error("Введите ник");
  const nickname = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (nickname.length < 2 || nickname.length > 24) {
    throw new Error("Ник должен содержать от 2 до 24 символов");
  }
  if (/https?:|t\.me|[@<>\u0000-\u001f\u007f]/iu.test(nickname)) {
    throw new Error("В нике есть недопустимые символы");
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(nickname)) {
    throw new Error("Используйте буквы, цифры, пробел, точку, дефис или подчёркивание");
  }
  return nickname;
}

export function normalizeChatMessage(value: unknown) {
  if (typeof value !== "string") throw new Error("Введите сообщение");
  const body = value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\v\f ]+/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) throw new Error("Сообщение не может быть пустым");
  if (body.length > CHAT_MESSAGE_LIMIT) {
    throw new Error(`Сообщение должно быть не длиннее ${CHAT_MESSAGE_LIMIT} символов`);
  }
  return body;
}

function createDefaultNickname(participantId: string) {
  return `Странник ${participantId.slice(0, 4).toUpperCase()}`;
}

export async function createPrivatePresenceSession(subjectHash: string): Promise<PrivatePresenceSession> {
  const participantId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const nickname = createDefaultNickname(participantId);
  const avatarId = getTelegramAvatarId(participantId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await supabaseRequest("rpc/create_private_telegram_session", {
    method: "POST",
    body: JSON.stringify({
      p_subject_hash: subjectHash,
      p_token_hash: hashSessionToken(token),
      p_participant_id: participantId,
      p_nickname: nickname,
      p_avatar_id: avatarId,
      p_expires_at: expiresAt
    })
  });

  return { participantId, token, nickname, avatarId, expiresAt };
}

export async function requirePrivateSession(token: string) {
  if (!token || token.length < 32) throw new Error("Private session is missing");
  const tokenHash = hashSessionToken(token);
  const rows = await supabaseRequest<PrivateSessionRow[]>(
    `telegram_private_sessions?select=participant_id,expires_at,revoked_at&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
  );
  const session = rows?.[0];
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    throw new Error("Private session has expired");
  }
  return session;
}

export async function updateOwnPresence(token: string, updates: {
  nickname?: unknown;
  position?: unknown;
  rotationY?: unknown;
  animation?: unknown;
}) {
  const session = await requirePrivateSession(token);
  const now = new Date().toISOString();
  const payload: Record<string, string | number> = { last_seen_at: now };

  if (updates.nickname !== undefined) payload.nickname = normalizeSessionNickname(updates.nickname);
  if (Array.isArray(updates.position) && updates.position.length === 3) {
    const position = updates.position.map(Number);
    if (position.every(Number.isFinite)) {
      payload.position_x = Math.max(-250, Math.min(250, position[0]));
      payload.position_y = Math.max(-10, Math.min(80, position[1]));
      payload.position_z = Math.max(-250, Math.min(250, position[2]));
    }
  }
  if (Number.isFinite(Number(updates.rotationY))) {
    payload.rotation_y = Number(updates.rotationY);
  }
  if (typeof updates.animation === "string" && /^[a-z0-9_-]{1,48}$/i.test(updates.animation)) {
    payload.animation = updates.animation;
  }

  const rows = await supabaseRequest<PresenceRow[]>(
    `pseudonymous_presence?participant_id=eq.${encodeURIComponent(session.participant_id)}&select=participant_id,nickname,avatar_id,position_x,position_y,position_z,rotation_y,animation,last_seen_at`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    }
  );
  await supabaseRequest(
    `telegram_private_sessions?participant_id=eq.${encodeURIComponent(session.participant_id)}`,
    { method: "PATCH", body: JSON.stringify({ last_seen_at: now }) }
  );
  const presence = rows?.[0];
  if (!presence) throw new Error("Presence is unavailable");
  return mapPresence(presence);
}

export async function listActivePresence(token: string): Promise<PublicPresence[]> {
  await requirePrivateSession(token);
  const activeAfter = new Date(Date.now() - ACTIVE_WINDOW_SECONDS * 1000).toISOString();
  const rows = await supabaseRequest<PresenceRow[]>(
    `pseudonymous_presence?select=participant_id,nickname,avatar_id,position_x,position_y,position_z,rotation_y,animation,last_seen_at&room_key=eq.${ROOM_KEY}&last_seen_at=gte.${encodeURIComponent(activeAfter)}&order=last_seen_at.desc&limit=48`
  );
  return (rows ?? []).map(mapPresence);
}

export async function listSessionChat(token: string): Promise<PublicChatMessage[]> {
  const session = await requirePrivateSession(token);
  const now = new Date().toISOString();
  const rows = await supabaseRequest<ChatRow[]>(
    `pseudonymous_chat_messages?select=id,participant_id,nickname_snapshot,body,created_at&room_key=eq.${ROOM_KEY}&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=${CHAT_HISTORY_LIMIT}`
  );
  return (rows ?? []).reverse().map((row) => mapChatMessage(row, session.participant_id));
}

export async function postSessionChatMessage(token: string, value: unknown): Promise<PublicChatMessage> {
  const session = await requirePrivateSession(token);
  const body = normalizeChatMessage(value);
  const recentAfter = new Date(Date.now() - CHAT_RATE_WINDOW_SECONDS * 1000).toISOString();
  const recentRows = await supabaseRequest<Array<{ id: string }>>(
    `pseudonymous_chat_messages?select=id&participant_id=eq.${encodeURIComponent(session.participant_id)}&created_at=gte.${encodeURIComponent(recentAfter)}&limit=${CHAT_RATE_LIMIT}`
  );
  if ((recentRows ?? []).length >= CHAT_RATE_LIMIT) {
    throw new Error("Слишком много сообщений. Сделайте короткую паузу");
  }

  const presenceRows = await supabaseRequest<Array<Pick<PresenceRow, "nickname">>>(
    `pseudonymous_presence?select=nickname&participant_id=eq.${encodeURIComponent(session.participant_id)}&limit=1`
  );
  const presence = presenceRows?.[0];
  if (!presence) throw new Error("Private session has expired");

  const maximumExpiry = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Math.min(Date.parse(session.expires_at), maximumExpiry)).toISOString();
  const rows = await supabaseRequest<ChatRow[]>("pseudonymous_chat_messages?select=id,participant_id,nickname_snapshot,body,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      room_key: ROOM_KEY,
      participant_id: session.participant_id,
      nickname_snapshot: presence.nickname,
      body,
      expires_at: expiresAt
    })
  });
  const message = rows?.[0];
  if (!message) throw new Error("Chat message was not saved");
  return mapChatMessage(message, session.participant_id);
}

function mapPresence(row: PresenceRow): PublicPresence {
  return {
    participantId: row.participant_id,
    nickname: row.nickname,
    avatarId: row.avatar_id,
    position: [row.position_x, row.position_y, row.position_z],
    rotationY: row.rotation_y,
    animation: row.animation,
    lastSeenAt: row.last_seen_at
  };
}

function mapChatMessage(row: ChatRow, ownParticipantId: string): PublicChatMessage {
  return {
    id: row.id,
    nickname: row.nickname_snapshot,
    body: row.body,
    createdAt: row.created_at,
    mine: row.participant_id === ownParticipantId
  };
}
