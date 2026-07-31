export const TELEGRAM_SCENE_ASSET_SLUGS = [
  "82-council-round-marble-gold-table",
  "92-council-chair-v2",
] as const;

export const TELEGRAM_AVATAR_IDS = [
  "east-seer-dawn-neutral-v2-cyber",
  "female-initiate-neutral-v2-cyber",
  "void-archon-v3-cyber",
  "gold-crown-sentinel-v3-cyber",
  "crimson-elder-v3-cyber",
  "lunar-adept-v3-cyber",
] as const;

const TELEGRAM_SCENE_ASSET_SET = new Set<string>(TELEGRAM_SCENE_ASSET_SLUGS);

export function isTelegramSceneAsset(slug: string) {
  return TELEGRAM_SCENE_ASSET_SET.has(slug);
}

export function getTelegramAvatarId(userId?: number) {
  if (!Number.isSafeInteger(userId)) return TELEGRAM_AVATAR_IDS[0];
  const index = Math.abs(userId as number) % TELEGRAM_AVATAR_IDS.length;
  return TELEGRAM_AVATAR_IDS[index];
}

export function getTelegramAvatarMotion(avatarId: string) {
  return avatarId === "female-initiate-neutral-v2-cyber" || avatarId === "lunar-adept-v3-cyber"
    ? "female-walk-loop"
    : "daily-walk-loop";
}
