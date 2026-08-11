import { Address } from "@ton/ton";
import { describe, expect, it } from "vitest";
import {
  normalizeTestnetGramWallet,
  TESTNET_GRAM_AMOUNT_RAW,
  TESTNET_GRAM_NETWORK
} from "@/lib/testnetGramFaucet";

describe("testnet GRAM grant boundaries", () => {
  const raw = "0:1111111111111111111111111111111111111111111111111111111111111111";

  it("keeps the grant fixed at 100 GRAM on testnet", () => {
    expect(TESTNET_GRAM_AMOUNT_RAW).toBe(100_000_000_000n);
    expect(TESTNET_GRAM_NETWORK).toBe("-3");
  });

  it("normalizes friendly basechain addresses to one replay-safe key", () => {
    const friendly = Address.parse(raw).toString({ testOnly: true });
    expect(normalizeTestnetGramWallet(friendly)).toBe(raw);
    expect(normalizeTestnetGramWallet(raw)).toBe(raw);
  });

  it("rejects invalid and masterchain recipients", () => {
    expect(() => normalizeTestnetGramWallet("not-an-address")).toThrow(/корректный кошелёк/i);
    expect(() => normalizeTestnetGramWallet(`-1:${"2".repeat(64)}`)).toThrow(/базовой цепи/i);
  });
});
