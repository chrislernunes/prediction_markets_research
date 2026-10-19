/**
 * Single source of truth for on-chain addresses (Polygon mainnet, chain 137).
 *
 * Checked against https://docs.polymarket.com/resources/contracts on 2026-10-19.
 * Re-check before relying on any address: Polymarket has migrated exchange and
 * collateral contracts before (CLOB V1 -> V2), and the execution experiments in
 * this repository still target the V1 set. See docs/maintenance.md.
 */

export const POLYGON_CHAIN_ID = 137;

/** Conditional Tokens Framework (ERC-1155 position storage). Same under V1 and V2. */
export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

/** Neg Risk Adapter (converts NO tokens between outcomes of a neg-risk event). */
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

/** CLOB V1 contracts. The legacy signing and redemption experiments still use these. */
export const LEGACY_V1 = {
  CTF_EXCHANGE: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  NEG_RISK_CTF_EXCHANGE: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
  /** USDC.e (bridged USDC), 6 decimals: V1 collateral. */
  USDC_E: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
} as const;

/** CLOB V2 contracts. Nothing in this repository signs or settles against these yet. */
export const V2 = {
  CTF_EXCHANGE: "0xE111180000d2663C0091e4f400237545B87B996B",
  NEG_RISK_CTF_EXCHANGE: "0xe2222d279d744050d28e00520010520000310F59",
  /** pUSD collateral token (proxy). */
  PUSD: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  COLLATERAL_ONRAMP: "0x93070a847efEf7F70739046A929D47a521F5B8ee",
  COLLATERAL_OFFRAMP: "0x2957922Eb93258b93368531d39fAcCA3B4dC5854",
  CTF_COLLATERAL_ADAPTER: "0xAdA100Db00Ca00073811820692005400218FcE1f",
} as const;

export const NEG_RISK_REDEMPTION_DISABLED =
  "Neg-risk redemption is disabled: the legacy path sent a CTF-style redeemPositions call to the " +
  "V1 Neg Risk CTF Exchange address rather than the Neg Risk Adapter, whose redeem ABI differs. " +
  "Re-implement against the current adapter and collateral before enabling (docs/maintenance.md).";
