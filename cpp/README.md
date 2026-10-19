# C++ research tools

The lab uses polymarket-cpp-client
**v3.0.0** (pinned by commit in `CMakeLists.txt`), with C++20 and CMake 3.22+. Install libcurl, OpenSSL, zlib, and Git.

## Build and test

Run from the repository root:

```bash
cmake -S cpp -B cpp/build -DCMAKE_BUILD_TYPE=Release
cmake --build cpp/build --parallel 4
ctest --test-dir cpp/build --output-on-failure
```

The default build includes every executable and the offline tests (`market_stream_test`,
`example_strategies_test`, `contracts_test`). Release builds are portable by default;
pass `-DENABLE_NATIVE_ARCH=ON` to add `-march=native` for a binary that stays on the build
machine. Pass `-DPOLYARB_BUILD_EXECUTION_APPS=OFF` for a research-only build. CMake checks
whether link-time optimization is supported.

Layout: libraries in `src/` with headers in `include/`, public-data tools in
`apps/research/`, credentialed experiments in `apps/execution/`, tests in `tests/`.

## Research scanner

`discovery_mode` fetches public markets and books, evaluates example signals,
and emits JSONL with paper projections. It does not place orders.

```bash
./cpp/build/discovery_mode --help
./cpp/build/discovery_mode --max 50 --iterations 1
./cpp/build/discovery_mode --15m --duration-min 30 \
  --interval-ms 30000 --out data/discovery.jsonl
```

Signals include `binary_arbitrage` and `market_making_candidate`. The calculations
check visible prices and depth, not a complete fee or execution model. Treat
reported edge as a research input, not realized profit.

Arbitrage depth is measured in bundles (equal YES and NO shares), the unit that pays $1,
not per-leg dollar notional. Each candidate is then re-priced by sweeping the full ask
ladders (`refine_binary_arb_with_depth`), so `edge_cents`, `combined_ask`,
`executable_depth_usdc` and `paper_trade` describe the same fill. Candidates that no longer
clear the threshold after slippage or lack depth emit a `signal_rejected` event so the
denominator stays visible. `paper_trade.depth_limited` marks projections capped by the book.

## Execution experiments

`polymarket_arb`, `arb_test`, `batch_order_smoke`, `ladder_accumulation`,
`avg_in_test`, `order_test`, `order_benchmark`, and `position_smoke` contain
credentialed or execution-related code. `clob_client_test` requests live API data.
These are executable names, not offline CTest registrations.

Several experiments construct orders manually or use older exchange addresses.
They require a separate CLOB V2 migration and validation before live use.
An SDK upgrade or a passing compilation does not establish execution correctness.
See the SDK CLOB V2 migration notes shipped with the pinned client (`docs/clob-v2-migration.md`).

Do not infer dry-run behavior from an executable's name. Inspect its argument
and environment handling before running it. Offline CI runs only the registered
tests (`market_stream_test`, `example_strategies_test`, `contracts_test`) through CTest, and
builds every other target so they cannot rot silently.

## Updating the SDK

```bash
bun run cpp:update-client
POLYMARKET_CLIENT_GIT_TAG=<tag-or-commit> bun run cpp:update-client
```

The SDK is pinned in `CMakeLists.txt` to the commit of v3.0.0 (immutable, unlike a tag), and
configure does not re-check the remote unless `-DPOLYARB_FETCH_UPDATES=ON` (the helper sets
it). The helper clears the cached SDK checkout and rebuilds the research scanner and
main executable. Run the full build and CTest suite when changing the pinned ref, then pin
the commit you keep.
Use namespaced public headers, for example `<polymarket/market_fetcher.hpp>`.

For contribution rules and compatibility boundaries, see
[CONTRIBUTING.md](../CONTRIBUTING.md) and [docs/maintenance.md](../docs/maintenance.md).
