import { describe, expect, test } from "bun:test";
import { CTF_ADDRESS, LEGACY_V1, NEG_RISK_ADAPTER, NEG_RISK_REDEMPTION_DISABLED, POLYGON_CHAIN_ID, V2 } from "../../src/core/contracts";

const address = /^0x[0-9a-fA-F]{40}$/;

describe("contracts", () => {
  test("every address is well formed", () => {
    for (const value of [CTF_ADDRESS, NEG_RISK_ADAPTER, ...Object.values(LEGACY_V1), ...Object.values(V2)]) {
      expect(value).toMatch(address);
    }
    expect(POLYGON_CHAIN_ID).toBe(137);
  });

  test("the neg-risk adapter is not the neg-risk exchange (the legacy redemption bug)", () => {
    expect(NEG_RISK_ADAPTER).not.toBe(LEGACY_V1.NEG_RISK_CTF_EXCHANGE);
    expect(NEG_RISK_ADAPTER).not.toBe(V2.NEG_RISK_CTF_EXCHANGE);
    expect(NEG_RISK_REDEMPTION_DISABLED).toContain("disabled");
  });

  test("V1 and V2 exchange sets do not overlap", () => {
    expect(LEGACY_V1.CTF_EXCHANGE).not.toBe(V2.CTF_EXCHANGE);
    expect(LEGACY_V1.NEG_RISK_CTF_EXCHANGE).not.toBe(V2.NEG_RISK_CTF_EXCHANGE);
  });
});
