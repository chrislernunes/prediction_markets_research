#pragma once

#include <example_strategies.hpp>

#include <polymarket/types.hpp>

#include <vector>

namespace polyarb
{
struct FillSimulation
{
    bool fillable{false};
    double requested_shares{0.0};
    double filled_shares{0.0};
    double unfilled_shares{0.0};
    double spent_usdc{0.0};
    double avg_price{0.0};
    double best_price{0.0};
    double slippage_bps{0.0};
};

struct BinaryBundleSimulation
{
    bool fillable{false};
    double requested_bundles{0.0};
    FillSimulation yes;
    FillSimulation no;
    double combined_avg_price{0.0};
    double combined_best_price{0.0};
    double edge_cents{0.0};
};

FillSimulation simulate_buy_shares(
    const std::vector<polymarket::PriceLevel> &asks,
    double target_shares);

BinaryBundleSimulation simulate_binary_bundle_buy(
    const std::vector<polymarket::PriceLevel> &yes_asks,
    const std::vector<polymarket::PriceLevel> &no_asks,
    double target_bundles);

// Re-prices a binary-arbitrage signal against the full ask ladders. The requested
// paper stake is swept level by level; if the book is too shallow the size shrinks
// to what both legs can fill. Returns false (and leaves the signal untouched) when
// nothing meaningful fills or the average combined price no longer clears
// config.arb_threshold. On success edge_cents, combined_ask, executable_depth_usdc
// and the paper trade all describe the same sweep, so one edge number is reported.
// Other signal types pass through unchanged. Gross of fees and one-leg risk.
bool refine_binary_arb_with_depth(
    StrategySignal &signal,
    const std::vector<polymarket::PriceLevel> &yes_asks,
    const std::vector<polymarket::PriceLevel> &no_asks,
    const StrategyConfig &config);
} // namespace polyarb
