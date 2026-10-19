#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace polyarb
{
enum class SignalType
{
    BinaryArbitrage,
    MarketMakingCandidate
};

struct MarketSnapshot
{
    std::string slug;
    std::string title;
    std::string condition_id;
    std::string token_yes;
    std::string token_no;
    double yes_bid{0.0};
    double yes_ask{0.0};
    double no_bid{0.0};
    double no_ask{0.0};
    double yes_ask_size{0.0};
    double no_ask_size{0.0};
    uint64_t timestamp_ns{0};
};

// Gross paper projection for equal YES/NO shares, before fees. The projection
// never claims more shares than the visible best-ask depth supports: when the
// requested stake does not fit, it is capped and depth_limited is set.
struct PaperTrade
{
    double requested_stake_usdc{0.0};
    bool depth_limited{false};
    double stake_usdc{0.0};
    double expected_payout_usdc{0.0};
    double expected_edge_usdc{0.0};
    double yes_shares{0.0};
    double no_shares{0.0};
};

struct StrategySignal
{
    SignalType type{SignalType::BinaryArbitrage};
    std::string slug;
    std::string reason;
    double score{0.0};
    double edge_cents{0.0};
    double combined_ask{0.0};
    // Binary arbitrage: cost of the largest equal-share YES/NO set available at the
    // best asks (min(YES size, NO size) * combined ask). Market making: YES ask notional.
    double executable_depth_usdc{0.0};
    std::optional<PaperTrade> paper_trade;
};

struct StrategyConfig
{
    double arb_threshold{0.98};
    double min_depth_usd{5.0};
    double paper_stake_usdc{10.0};
    double min_market_making_spread_bps{250.0};
};

std::vector<StrategySignal> evaluate_example_strategies(
    const MarketSnapshot &snapshot,
    const StrategyConfig &config);

const StrategySignal *find_signal(
    const std::vector<StrategySignal> &signals,
    SignalType type);

std::string signal_type_name(SignalType type);
} // namespace polyarb
