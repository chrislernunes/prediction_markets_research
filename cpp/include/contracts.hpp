#pragma once

#include <string_view>

// Single source of truth for on-chain addresses (Polygon mainnet, chain 137).
// Checked against https://docs.polymarket.com/resources/contracts on 2026-10-19.
// Mirrors src/core/contracts.ts. The execution experiments still target the
// CLOB V1 set; see docs/maintenance.md before relying on any of these.
namespace polyarb::contracts
{
inline constexpr std::string_view kCtf = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
inline constexpr std::string_view kNegRiskAdapter = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

// CLOB V1 (legacy, used by the execution experiments)
inline constexpr std::string_view kLegacyCtfExchange = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
inline constexpr std::string_view kLegacyNegRiskCtfExchange = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
inline constexpr std::string_view kLegacyUsdcE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// CLOB V2 (not used for signing or settlement anywhere in this repository yet)
inline constexpr std::string_view kV2CtfExchange = "0xE111180000d2663C0091e4f400237545B87B996B";
inline constexpr std::string_view kV2NegRiskCtfExchange = "0xe2222d279d744050d28e00520010520000310F59";
inline constexpr std::string_view kV2Pusd = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
} // namespace polyarb::contracts
