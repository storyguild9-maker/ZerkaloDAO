import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateTelegramInitData } from "./telegramAuth";

function signedInitData(botToken: string, fields: Record<string, string>) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

describe("validateTelegramInitData", () => {
  it("validates initData containing Telegram's signature field", () => {
    const botToken = "123456:test-token";
    const initData = signedInitData(botToken, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "AAEAAAE",
      signature: "telegram-ed25519-signature",
      user: JSON.stringify({ id: 42, first_name: "Test" })
    });

    expect(validateTelegramInitData(initData, botToken).user.id).toBe(42);
  });

  it("rejects changes to the signed signature field", () => {
    const botToken = "123456:test-token";
    const initData = new URLSearchParams(signedInitData(botToken, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      signature: "original-signature",
      user: JSON.stringify({ id: 42, first_name: "Test" })
    }));
    initData.set("signature", "changed-signature");

    expect(() => validateTelegramInitData(initData.toString(), botToken))
      .toThrow("Telegram signature is invalid");
  });
});
