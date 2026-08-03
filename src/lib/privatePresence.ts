import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  getTelegramAvatarId,
  getTelegramAvatarIdForGender,
  normalizeTelegramAvatarGender
} from "@/lib/telegramScene";

const SESSION_TTL_HOURS = 12;
const ACTIVE_WINDOW_SECONDS = 300;
const ROOM_KEY = "temple-main";
const CHAT_HISTORY_LIMIT = 80;
const CHAT_MESSAGE_LIMIT = 500;
const CHAT_RATE_WINDOW_SECONDS = 10;
const CHAT_RATE_LIMIT = 5;
const PRIVATE_ROOM_LIMIT = 12;
const PRIVATE_ROOM_DIRECTORY_LIMIT = 48;
const PRIVATE_ROOM_CODE_LENGTH = 8;
const PRIVATE_ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export type PublicChatRoom = {
  id: string;
  name: string;
  joined: boolean;
  createdAt: string;
  expiresAt: string;
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

type ChatRoomRow = {
  id: string;
  invite_code: string;
  name: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
  expires_at: string;
};
type ChatRoomPublicRow = Pick<ChatRoomRow, "id" | "name" | "created_at" | "expires_at">;


type ChatRoomMemberRow = {
  room_id: string;
  expires_at: string;
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

export function normalizeChatRoomName(value: unknown) {
  if (typeof value !== "string") throw new Error("Введите название комнаты");
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 32) {
    throw new Error("Название должно содержать от 2 до 32 символов");
  }
  if (/[<>\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("В названии есть недопустимые символы");
  }
  return name;
}

export function normalizeChatRoomPassword(value: unknown) {
  if (typeof value !== "string") throw new Error("Введите пароль");
  const password = value.normalize("NFKC").trim();
  if (password.length < 6 || password.length > 72) {
    throw new Error("Пароль должен содержать от 6 до 72 символов");
  }
  if (/[\u0000-\u001f\u007f]/u.test(password)) {
    throw new Error("В пароле есть недопустимые символы");
  }
  return password;
}

export function normalizeChatRoomCode(value: unknown) {
  if (typeof value !== "string") throw new Error("Введите код комнаты");
  const code = value.normalize("NFKC").toUpperCase().replace(/[\s-]+/g, "");
  if (code.length !== PRIVATE_ROOM_CODE_LENGTH || !new RegExp(`^[${PRIVATE_ROOM_CODE_ALPHABET}]+$`).test(code)) {
    throw new Error("Код комнаты должен содержать 8 символов");
  }
  return code;
}

export function hashChatRoomPassword(password: string, salt: string) {
  if (!/^[0-9a-f]{32}$/i.test(salt)) throw new Error("Password salt is invalid");
  return scryptSync(normalizeChatRoomPassword(password), Buffer.from(salt, "hex"), 64).toString("hex");
}

export function verifyChatRoomPassword(password: unknown, salt: string, expectedHash: string) {
  if (!/^[0-9a-f]{128}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashChatRoomPassword(normalizeChatRoomPassword(password), salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createChatRoomCode() {
  const bytes = randomBytes(PRIVATE_ROOM_CODE_LENGTH);
  return Array.from(bytes, (value) => PRIVATE_ROOM_CODE_ALPHABET[value % PRIVATE_ROOM_CODE_ALPHABET.length]).join("");
}

function normalizeChatRoomId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("Комната не найдена");
  return value.toLowerCase();
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

export async function authorizeRealtimeParticipant(token: string, authUserId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
    throw new Error("Realtime identity is invalid");
  }
  const session = await requirePrivateSession(token);
  await supabaseRequest("realtime_participants?on_conflict=auth_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      auth_user_id: authUserId,
      participant_id: session.participant_id,
      room_key: ROOM_KEY,
      expires_at: session.expires_at,
      updated_at: new Date().toISOString()
    })
  });
}

export async function updateOwnPresence(token: string, updates: {
  nickname?: unknown;
  avatarGender?: unknown;
  position?: unknown;
  rotationY?: unknown;
  animation?: unknown;
}) {
  const session = await requirePrivateSession(token);
  const now = new Date().toISOString();
  const payload: Record<string, string | number> = { last_seen_at: now };

  if (updates.nickname !== undefined) payload.nickname = normalizeSessionNickname(updates.nickname);
  if (updates.avatarGender !== undefined) {
    const gender = normalizeTelegramAvatarGender(updates.avatarGender);
    payload.avatar_id = getTelegramAvatarIdForGender(session.participant_id, gender);
  }
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

function mapChatRoom(row: ChatRoomPublicRow, joined = true): PublicChatRoom {
  return {
    id: row.id,
    name: row.name,
    joined,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

async function listChatRoomDirectoryForSession(session: PrivateSessionRow): Promise<PublicChatRoom[]> {
  const now = new Date().toISOString();
  const memberships = await supabaseRequest<ChatRoomMemberRow[]>(
    `pseudonymous_chat_room_members?select=room_id,expires_at&participant_id=eq.${encodeURIComponent(session.participant_id)}&expires_at=gt.${encodeURIComponent(now)}&order=joined_at.asc&limit=${PRIVATE_ROOM_LIMIT}`
  );
  const joinedRoomIds = new Set(
    (memberships ?? []).map((membership) => membership.room_id).filter((id) => UUID_PATTERN.test(id))
  );
  const rows = await supabaseRequest<ChatRoomPublicRow[]>(
    `pseudonymous_chat_rooms?select=id,name,created_at,expires_at&expires_at=gt.${encodeURIComponent(now)}&order=created_at.asc&limit=${PRIVATE_ROOM_DIRECTORY_LIMIT}`
  );
  return (rows ?? []).map((row) => mapChatRoom(row, joinedRoomIds.has(row.id)));
}

export async function listChatRoomDirectory(token: string): Promise<PublicChatRoom[]> {
  return listChatRoomDirectoryForSession(await requirePrivateSession(token));
}

export async function createPrivateChatRoom(
  token: string,
  nameValue: unknown,
  passwordValue: unknown
): Promise<PublicChatRoom> {
  const session = await requirePrivateSession(token);
  const joinedRooms = (await listChatRoomDirectoryForSession(session)).filter((room) => room.joined);
  if (joinedRooms.length >= PRIVATE_ROOM_LIMIT) {
    throw new Error("Достигнут лимит закрытых комнат");
  }

  const name = normalizeChatRoomName(nameValue);
  const password = normalizeChatRoomPassword(passwordValue);
  const salt = randomBytes(16).toString("hex");
  const expiresAt = session.expires_at;
  const rows = await supabaseRequest<ChatRoomRow[]>(
    "pseudonymous_chat_rooms?select=id,invite_code,name,password_salt,password_hash,created_at,expires_at",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        invite_code: createChatRoomCode(),
        name,
        password_salt: salt,
        password_hash: hashChatRoomPassword(password, salt),
        creator_participant_id: session.participant_id,
        expires_at: expiresAt
      })
    }
  );
  const room = rows?.[0];
  if (!room) throw new Error("Комната не была создана");
  await supabaseRequest("pseudonymous_chat_room_members?on_conflict=room_id,participant_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      room_id: room.id,
      participant_id: session.participant_id,
      expires_at: expiresAt
    })
  });
  return mapChatRoom(room, true);
}

export async function joinListedPrivateChatRoom(
  token: string,
  roomIdValue: unknown,
  passwordValue: unknown
): Promise<PublicChatRoom> {
  const session = await requirePrivateSession(token);
  const roomId = normalizeChatRoomId(roomIdValue);
  if (!roomId) throw new Error("Выберите диалог");
  const now = new Date().toISOString();
  const rows = await supabaseRequest<ChatRoomRow[]>(
    `pseudonymous_chat_rooms?select=id,invite_code,name,password_salt,password_hash,created_at,expires_at&id=eq.${encodeURIComponent(roomId)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`
  );
  const room = rows?.[0];
  if (!room || !verifyChatRoomPassword(passwordValue, room.password_salt, room.password_hash)) {
    throw new Error("Неверный пароль");
  }

  const expiresAt = new Date(Math.min(Date.parse(session.expires_at), Date.parse(room.expires_at))).toISOString();
  await supabaseRequest("pseudonymous_chat_room_members?on_conflict=room_id,participant_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      room_id: room.id,
      participant_id: session.participant_id,
      expires_at: expiresAt
    })
  });
  return mapChatRoom(room, true);
}

export async function joinPrivateChatRoom(
  token: string,
  codeValue: unknown,
  passwordValue: unknown
): Promise<PublicChatRoom> {
  const session = await requirePrivateSession(token);
  const code = normalizeChatRoomCode(codeValue);
  const now = new Date().toISOString();
  const rows = await supabaseRequest<ChatRoomRow[]>(
    `pseudonymous_chat_rooms?select=id,invite_code,name,password_salt,password_hash,created_at,expires_at&invite_code=eq.${encodeURIComponent(code)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`
  );
  const room = rows?.[0];
  if (!room || !verifyChatRoomPassword(passwordValue, room.password_salt, room.password_hash)) {
    throw new Error("Неверный код или пароль");
  }

  const expiresAt = new Date(Math.min(Date.parse(session.expires_at), Date.parse(room.expires_at))).toISOString();
  await supabaseRequest("pseudonymous_chat_room_members?on_conflict=room_id,participant_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      room_id: room.id,
      participant_id: session.participant_id,
      expires_at: expiresAt
    })
  });
  return mapChatRoom(room, true);
}

async function resolveChatRoomKey(session: PrivateSessionRow, roomIdValue?: unknown) {
  const roomId = normalizeChatRoomId(roomIdValue);
  if (!roomId) return ROOM_KEY;
  const now = new Date().toISOString();
  const rows = await supabaseRequest<ChatRoomMemberRow[]>(
    `pseudonymous_chat_room_members?select=room_id,expires_at&room_id=eq.${encodeURIComponent(roomId)}&participant_id=eq.${encodeURIComponent(session.participant_id)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`
  );
  if (!rows?.[0]) throw new Error("Нет доступа к комнате");
  return roomId;
}

export async function listSessionChat(token: string, roomId?: unknown): Promise<PublicChatMessage[]> {
  const session = await requirePrivateSession(token);
  const roomKey = await resolveChatRoomKey(session, roomId);
  const now = new Date().toISOString();
  const rows = await supabaseRequest<ChatRow[]>(
    `pseudonymous_chat_messages?select=id,participant_id,nickname_snapshot,body,created_at&room_key=eq.${encodeURIComponent(roomKey)}&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=${CHAT_HISTORY_LIMIT}`
  );
  return (rows ?? []).reverse().map((row) => mapChatMessage(row, session.participant_id));
}

export async function postSessionChatMessage(token: string, value: unknown, roomId?: unknown): Promise<PublicChatMessage> {
  const session = await requirePrivateSession(token);
  const roomKey = await resolveChatRoomKey(session, roomId);
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
      room_key: roomKey,
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
