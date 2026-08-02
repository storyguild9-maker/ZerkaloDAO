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

export type TelegramAvatarGender = "male" | "female";

export const TELEGRAM_AVATAR_POOLS = {
  male: [
    "east-seer-dawn-neutral-v2-cyber",
    "void-archon-v3-cyber",
    "gold-crown-sentinel-v3-cyber",
    "crimson-elder-v3-cyber",
  ],
  female: [
    "female-initiate-neutral-v2-cyber",
    "lunar-adept-v3-cyber",
  ],
} as const satisfies Record<TelegramAvatarGender, readonly (typeof TELEGRAM_AVATAR_IDS)[number][]>;

const TELEGRAM_SCENE_ASSET_SET = new Set<string>(TELEGRAM_SCENE_ASSET_SLUGS);

export function isTelegramSceneAsset(slug: string) {
  return TELEGRAM_SCENE_ASSET_SET.has(slug);
}

export function getTelegramAvatarId(sessionSeed?: string) {
  if (!sessionSeed) return TELEGRAM_AVATAR_IDS[0];
  const index = [...sessionSeed].reduce(
    (hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0,
    0
  ) % TELEGRAM_AVATAR_IDS.length;
  return TELEGRAM_AVATAR_IDS[index];
}

export function normalizeTelegramAvatarGender(value: unknown): TelegramAvatarGender {
  if (value === "male" || value === "female") return value;
  throw new Error("Выберите мужской или женский облик");
}

export function getTelegramAvatarIdForGender(sessionSeed: string, gender: TelegramAvatarGender) {
  const pool = TELEGRAM_AVATAR_POOLS[gender];
  const index = [...sessionSeed].reduce(
    (hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0,
    0
  ) % pool.length;
  return pool[index];
}

export function getTelegramAvatarMotion(avatarId: string) {
  return avatarId === "female-initiate-neutral-v2-cyber" || avatarId === "lunar-adept-v3-cyber"
    ? "female-walk-loop"
    : "daily-walk-loop";
}
