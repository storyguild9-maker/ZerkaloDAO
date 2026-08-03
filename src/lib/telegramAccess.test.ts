import { describe, expect, it } from "vitest";

import { isTelegramUserAllowed, parseTelegramAllowedUserIds } from "@/lib/telegramAccess";

describe("Telegram allowlist", () => {
  it("supports comma, semicolon, and whitespace separated IDs", () => {
    expect([...parseTelegramAllowedUserIds("42, 77;\n105")]).toEqual([42, 77, 105]);
  });

  it("keeps existing open access when the allowlist is not configured", () => {
    expect(isTelegramUserAllowed(42, "")).toBe(true);
  });

  it("allows only explicitly listed users when configured", () => {
    expect(isTelegramUserAllowed(77, "42,77")).toBe(true);
    expect(isTelegramUserAllowed(105, "42,77")).toBe(false);
  });

  it("rejects malformed IDs instead of silently weakening access", () => {
    expect(() => parseTelegramAllowedUserIds("42,not-an-id")).toThrow(/invalid Telegram user ID/);
  });
});
