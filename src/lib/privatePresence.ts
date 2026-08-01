import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { getTelegramAvatarId } from "@/lib/telegramScene";

const SESSION_TTL_HOURS = 12;
const ACTIVE_WINDOW_SECONDS = 120;
const ROOM_KEY = "temple-main";

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
