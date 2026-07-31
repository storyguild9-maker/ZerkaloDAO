import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type ValidatedTelegramSession = {
  authDate: number;
  queryId?: string;
  startParam?: string;
  user: TelegramUser;
};

function secureHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): ValidatedTelegramSession {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  if (!receivedHash) throw new Error("Telegram hash is missing");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!secureHexEqual(receivedHash, expectedHash)) throw new Error("Telegram signature is invalid");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) throw new Error("Telegram auth_date is invalid");
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds < -60 || ageSeconds > maxAgeSeconds) throw new Error("Telegram authorization has expired");

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user is missing");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || !user.first_name) throw new Error("Telegram user is invalid");

  return {
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    user
  };
}

