#include <slippage.hpp>

#include <algorithm>
#include <cmath>

namespace polyarb
{
namespace
{
bool valid_level(const polymarket::PriceLevel &level)
{
    return level.price > 0.0 && level.price < 1.0 && level.size > 0.0;
}

std::vector<polymarket::PriceLevel> sorted_asks(
    const std::vector<polymarket::PriceLevel> &asks)
{
    std::vector<polymarket::PriceLevel> levels;
    for (const auto &level : asks)
    {
        if (valid_level(level))
        {
            levels.push_back(level);
        }
    }

    std::sort(levels.begin(), levels.end(), [](const auto &a, const auto &b)
              { return a.price < b.price; });
    return levels;
}
} // namespace

FillSimulation simulate_buy_shares(
    const std::vector<polymarket::PriceLevel> &asks,
    double target_shares)
{
    FillSimulation result;
    result.requested_shares = std::max(0.0, target_shares);

    if (result.requested_shares <= 0.0)
    {
        result.fillable = true;
        return result;
    }

    const auto levels = sorted_asks(asks);
    if (levels.empty())
    {
        result.unfilled_shares = result.requested_shares;
        return result;
    }

    result.best_price = levels.front().price;
    double remaining = result.requested_shares;
    for (const auto &level : levels)
    {
        if (remaining <= 0.0)
        {
            break;
        }

        const double shares = std::min(remaining, level.size);
        result.filled_shares += shares;
        result.spent_usdc += shares * level.price;
        remaining -= shares;
    }

    result.unfilled_shares = std::max(0.0, remaining);
    result.fillable = result.unfilled_shares <= 1e-9;
    if (result.filled_shares > 0.0)
    {
        result.avg_price = result.spent_usdc / result.filled_shares;
    }
    if (result.best_price > 0.0)
    {
        result.slippage_bps = ((result.avg_price - result.best_price) / result.best_price) * 10000.0;
    }

    return result;
}

BinaryBundleSimulation simulate_binary_bundle_buy(
    const std::vector<polymarket::PriceLevel> &yes_asks,
    const std::vector<polymarket::PriceLevel> &no_asks,
    double target_bundles)
{
    BinaryBundleSimulation result;
    result.requested_bundles = std::max(0.0, target_bundles);
    if (result.requested_bundles <= 0.0)
    {
        return result;
    }

    result.yes = simulate_buy_shares(yes_asks, result.requested_bundles);
    result.no = simulate_buy_shares(no_asks, result.requested_bundles);
    result.fillable = result.yes.fillable && result.no.fillable;
    result.combined_avg_price = result.yes.avg_price + result.no.avg_price;
    result.combined_best_price = result.yes.best_price + result.no.best_price;
    result.edge_cents = result.fillable ? (1.0 - result.combined_avg_price) * 100.0 : 0.0;
    return result;
}
bool refine_binary_arb_with_depth(
    StrategySignal &signal,
    const std::vector<polymarket::PriceLevel> &yes_asks,
    const std::vector<polymarket::PriceLevel> &no_asks,
    const StrategyConfig &config)
{
    if (signal.type != SignalType::BinaryArbitrage)
    {
        return true;
    }

    const double top_combined = signal.combined_ask;
    double bundles = top_combined > 0.0 ? config.paper_stake_usdc / top_combined : 0.0;
    auto sweep = simulate_binary_bundle_buy(yes_asks, no_asks, bundles);
    if (!sweep.fillable)
    {
        bundles = std::min(sweep.yes.filled_shares, sweep.no.filled_shares);
        sweep = simulate_binary_bundle_buy(yes_asks, no_asks, bundles);
    }
    if (bundles <= 0.0 || !sweep.fillable)
    {
        return false;
    }

    const double spent = sweep.yes.spent_usdc + sweep.no.spent_usdc;
    if (spent < config.min_depth_usd || sweep.combined_avg_price >= config.arb_threshold)
    {
        return false;
    }

    PaperTrade trade;
    trade.requested_stake_usdc = config.paper_stake_usdc;
    trade.depth_limited = spent + 1e-9 < config.paper_stake_usdc;
    trade.stake_usdc = spent;
    trade.yes_shares = bundles;
    trade.no_shares = bundles;
    trade.expected_payout_usdc = bundles;
    trade.expected_edge_usdc = bundles - spent;

    signal.edge_cents = sweep.edge_cents;
    signal.combined_ask = sweep.combined_avg_price;
    signal.executable_depth_usdc = spent;
    signal.reason = "YES ask plus NO ask is below redemption value after sweeping the book";
    signal.paper_trade = trade;
    return true;
}
} // namespace polyarb
