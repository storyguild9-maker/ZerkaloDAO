export function parseTelegramAllowedUserIds(
  value: string | undefined,
  source = "TELEGRAM_ALLOWED_USER_IDS",
) {
  if (!value?.trim()) return new Set<number>();

  const ids = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((candidate) => Number(candidate));

  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`${source} contains an invalid Telegram user ID`);
  }

  return new Set(ids);
}

export function isTelegramUserAllowed(
  userId: number,
  configuredIds = process.env.TELEGRAM_ALLOWED_USER_IDS,
  additionalConfiguredIds = process.env.TELEGRAM_ADDITIONAL_ALLOWED_USER_IDS,
) {
  const allowedIds = parseTelegramAllowedUserIds(configuredIds);
  const additionalAllowedIds = parseTelegramAllowedUserIds(
    additionalConfiguredIds,
    "TELEGRAM_ADDITIONAL_ALLOWED_USER_IDS",
  );
  return (
    (allowedIds.size === 0 && additionalAllowedIds.size === 0)
    || allowedIds.has(userId)
    || additionalAllowedIds.has(userId)
  );
}
