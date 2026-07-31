import { describe, expect, it } from "vitest";
import { getTelegramAvatarId, getTelegramAvatarMotion, isTelegramSceneAsset, TELEGRAM_AVATAR_IDS } from "./telegramScene";

describe("Telegram light scene", () => {
  it("keeps only the table and chair models", () => {
    expect(isTelegramSceneAsset("82-council-round-marble-gold-table")).toBe(true);
    expect(isTelegramSceneAsset("92-council-chair-v2")).toBe(true);
    expect(isTelegramSceneAsset("239-white-gold-gothic-wall-bay-kit")).toBe(false);
  });

  it("assigns one stable avatar to each Telegram account", () => {
    expect(getTelegramAvatarId(42)).toBe(getTelegramAvatarId(42));
    expect(TELEGRAM_AVATAR_IDS).toContain(getTelegramAvatarId(42));
  });

  it("uses the gender-appropriate lightweight walking clip", () => {
    expect(getTelegramAvatarMotion("female-initiate-neutral-v2-cyber")).toBe("female-walk-loop");
    expect(getTelegramAvatarMotion("lunar-adept-v3-cyber")).toBe("female-walk-loop");
    expect(getTelegramAvatarMotion("east-seer-dawn-neutral-v2-cyber")).toBe("daily-walk-loop");
  });
});
