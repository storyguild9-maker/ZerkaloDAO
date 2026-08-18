import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPrivatePresenceSession,
  createTelegramSubjectHash,
  hashChatRoomPassword,
  hashSessionToken,
  normalizeChatMessage,
  normalizeChatRoomCode,
  normalizeChatRoomName,
  normalizeChatRoomPassword,
  normalizeSessionNickname,
  verifyChatRoomPassword
} from "./privatePresence";

describe("private Telegram presence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
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

  it("reports network failures as presence storage failures", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://presence.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(createPrivatePresenceSession("a".repeat(64)))
      .rejects.toThrow("Presence storage request failed (network)");
  });

  it("normalizes a temporary nickname and rejects profile links", () => {
    expect(normalizeSessionNickname("  Белый   Лотос  ")).toBe("Белый Лотос");
    expect(() => normalizeSessionNickname("@username")).toThrow();
    expect(() => normalizeSessionNickname("https://t.me/name")).toThrow();
  });

  it("normalizes ephemeral chat messages and rejects invalid bodies", () => {
    expect(normalizeChatMessage("  Тихий   свет\r\n\r\n\r\n  над водой  ")).toBe("Тихий свет\n\nнад водой");
    expect(() => normalizeChatMessage("   ")).toThrow("пустым");
    expect(() => normalizeChatMessage("я".repeat(501))).toThrow("500");
  });
  it("normalizes private room details and verifies only the correct password", () => {
    expect(normalizeChatRoomName("  Тихий   совет  ")).toBe("Тихий совет");
    expect(normalizeChatRoomCode("ab3d-ef7h")).toBe("AB3DEF7H");
    expect(normalizeChatRoomPassword("  шесть знаков  ")).toBe("шесть знаков");

    const salt = "12".repeat(16);
    const hash = hashChatRoomPassword("светлый ключ", salt);
    expect(hash).toHaveLength(128);
    expect(verifyChatRoomPassword("светлый ключ", salt, hash)).toBe(true);
    expect(verifyChatRoomPassword("другой ключ", salt, hash)).toBe(false);
    expect(() => normalizeChatRoomPassword("12345")).toThrow("6");
  });

});
