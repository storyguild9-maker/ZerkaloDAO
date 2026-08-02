import { describe, expect, it } from "vitest";
import {
  getTelegramAvatarId,
  getTelegramAvatarIdForGender,
  getTelegramAvatarMotion,
  isTelegramSceneAsset,
  normalizeTelegramAvatarGender,
  TELEGRAM_AVATAR_IDS,
  TELEGRAM_AVATAR_POOLS
} from "./telegramScene";

describe("Telegram light scene", () => {
  it("keeps only the table and chair models", () => {
    expect(isTelegramSceneAsset("82-council-round-marble-gold-table")).toBe(true);
    expect(isTelegramSceneAsset("92-council-chair-v2")).toBe(true);
    expect(isTelegramSceneAsset("239-white-gold-gothic-wall-bay-kit")).toBe(false);
  });

  it("assigns one stable avatar to each private session without a Telegram id", () => {
    expect(getTelegramAvatarId("private-session-a")).toBe(getTelegramAvatarId("private-session-a"));
    expect(TELEGRAM_AVATAR_IDS).toContain(getTelegramAvatarId("private-session-a"));
  });

  it("uses the gender-appropriate lightweight walking clip", () => {
    expect(getTelegramAvatarMotion("female-initiate-neutral-v2-cyber")).toBe("female-walk-loop");
    expect(getTelegramAvatarMotion("lunar-adept-v3-cyber")).toBe("female-walk-loop");
    expect(getTelegramAvatarMotion("east-seer-dawn-neutral-v2-cyber")).toBe("daily-walk-loop");
  });

  it("assigns gender-specific avatars and reuses the two female models", () => {
    const femaleAssignments = Array.from(
      { length: 12 },
      (_, index) => getTelegramAvatarIdForGender(`female-session-${index}`, "female")
    );
    expect(new Set(femaleAssignments).size).toBe(2);
    const femalePool = new Set<string>(TELEGRAM_AVATAR_POOLS.female);
    expect(femaleAssignments.every((avatarId) => femalePool.has(avatarId))).toBe(true);
    expect(TELEGRAM_AVATAR_POOLS.male).toContain(getTelegramAvatarIdForGender("male-session", "male"));
  });

  it("accepts only the two supported avatar genders", () => {
    expect(normalizeTelegramAvatarGender("female")).toBe("female");
    expect(normalizeTelegramAvatarGender("male")).toBe("male");
    expect(() => normalizeTelegramAvatarGender("unknown")).toThrow("облик");
  });
});
