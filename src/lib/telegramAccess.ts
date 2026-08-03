export function parseTelegramAllowedUserIds(value: string | undefined) {
  if (!value?.trim()) return new Set<number>();

  const ids = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((candidate) => Number(candidate));

  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("TELEGRAM_ALLOWED_USER_IDS contains an invalid Telegram user ID");
  }

  return new Set(ids);
}

export function isTelegramUserAllowed(
  userId: number,
  configuredIds = process.env.TELEGRAM_ALLOWED_USER_IDS,
) {
  const allowedIds = parseTelegramAllowedUserIds(configuredIds);
  return allowedIds.size === 0 || allowedIds.has(userId);
}
