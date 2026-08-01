import { describe, expect, it } from "vitest";
import {
  createTelegramSubjectHash,
  hashSessionToken,
  normalizeSessionNickname
} from "./privatePresence";

describe("private Telegram presence", () => {
  it("creates a stable irreversible subject without exposing the Telegram id", () => {
    const subject = createTelegramSubjectHash(123456789, "a".repeat(48));
    expect(subject).toHaveLength(64);
    expect(subject).toBe(createTelegramSubjectHash(123456789, "a".repeat(48)));
    expect(subject).not.toContain("123456789");
  });

  it("stores only a hash of the bearer token", () => {
    const token = "private-session-token-that-stays-in-memory";
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });

  it("normalizes a temporary nickname and rejects profile links", () => {
    expect(normalizeSessionNickname("  Белый   Лотос  ")).toBe("Белый Лотос");
    expect(() => normalizeSessionNickname("@username")).toThrow();
    expect(() => normalizeSessionNickname("https://t.me/name")).toThrow();
  });
});
