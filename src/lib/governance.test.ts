import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGovernanceVoterKey,
  governanceSignatureDomain,
  isGovernanceAdminSubjectHash,
  normalizeGovernanceOptions
} from "@/lib/governance";
import { createTelegramSubjectHash } from "@/lib/privatePresence";

const SECRET = "test-governance-session-secret-32-characters-long";

describe("governance privacy helpers", () => {
  beforeEach(() => {
    process.env.TELEGRAM_SESSION_SECRET = SECRET;
    process.env.TELEGRAM_GOVERNANCE_ADMIN_IDS = "1824423569, 1859000532";
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SESSION_SECRET;
    delete process.env.TELEGRAM_GOVERNANCE_ADMIN_IDS;
    delete process.env.TON_SIGN_DATA_DOMAIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("recognizes only server-derived governance administrators", () => {
    expect(isGovernanceAdminSubjectHash(createTelegramSubjectHash(1824423569, SECRET))).toBe(true);
    expect(isGovernanceAdminSubjectHash(createTelegramSubjectHash(999999999, SECRET))).toBe(false);
  });

  it("creates unlinkable voter keys for different proposals", () => {
    const subject = createTelegramSubjectHash(1824423569, SECRET);
    const first = createGovernanceVoterKey(subject, "11111111-1111-4111-8111-111111111111");
    const second = createGovernanceVoterKey(subject, "22222222-2222-4222-8222-222222222222");
    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(first).not.toBe(second);
  });

  it("normalizes unique proposal options", () => {
    expect(normalizeGovernanceOptions(["  За  ", "Против", "Воздержаться"])).toEqual([
      "За",
      "Против",
      "Воздержаться"
    ]);
    expect(() => normalizeGovernanceOptions(["За", "за"])).toThrow(/повторяться/);
  });

  it("derives the signing domain from the public application URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://zerkalo-dao.vercel.app/tg";
    expect(governanceSignatureDomain()).toBe("zerkalo-dao.vercel.app");
  });
});
