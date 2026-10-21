# prediction_markets_research

A workspace for prediction-market research: collect market snapshots 
across Polymarket and Kalshi, investigate pricing signals, and test
strategy hypotheses.

## Status and scope

- TypeScript tools cover market discovery, CSV collection, outcome analysis,
  and experimental strategies.
- C++ `discovery_mode` emits JSONL signals and paper projections without placing orders.
- Other C++ executables and TypeScript strategies contain execution paths.
  Their live trading compatibility is **not validated** by the offline tests.
  Several manually construct order payloads and retain older contract addresses.
  Upgrading the SDK alone does not migrate those execution paths.
- Paper results do not include a complete execution, fee, settlement, or inventory model.
  Historical CSVs and plots are research artifacts, not current performance claims.

## Quick start: TypeScript

Requires [Bun](https://bun.sh/) 1.3.5 (the CI version, also in `.bun-version`).

```bash
git clone https://github.com/chrislernunes/prediction_markets_research.git
cd prediction_markets_research
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun run check:repo   # repository hygiene checks used in CI

# Public market analysis; requests live APIs, but does not place orders
bun run analyze

# Collect market snapshots into ./data until Ctrl+C
bun run collect
```

Collection writes a per-run manifest, per-scan coverage summaries, and a reason-coded
failure log next to the data, so excluded markets stay countable. See
[research data](docs/research-data.md).

`bun run plots` currently runs the same summary script as `bun run analyze`;
it does not regenerate the historical PNG plots.

## Quick start: C++ research

Requires CMake 3.22+, a C++20 compiler, Git, libcurl, OpenSSL, and zlib.
Linux and macOS are checked in CI. On Ubuntu:

```bash
sudo apt-get install cmake build-essential git libcurl4-openssl-dev libssl-dev zlib1g-dev
```

From the repository root:

```bash
bun run cpp:configure
bun run cpp:build
bun run cpp:test

# One public market scan; writes JSONL to stdout
bun run discovery:cpp

# Crypto 15-minute markets, with a bounded collection period
./cpp/build/discovery_mode --15m --duration-min 30 \
  --interval-ms 30000 --out data/discovery.jsonl
```

CMake pins `polymarket-cpp-client` to the commit of **v3.0.0**. The workspace uses the SDK's
public `<polymarket/...>` headers and `polymarket::client` target.
To rebuild the dependency, or explicitly test another ref:

```bash
bun run cpp:update-client
POLYMARKET_CLIENT_GIT_TAG=<tag-or-commit> bun run cpp:update-client
```

See [cpp/README.md](cpp/README.md) for executable scope and build details.

## Test a hypothesis

The “nothing ever happens” scripts measure historical binary Yes/No outcomes.
Choose your own snapshot CSV; raw datasets are not bundled with the repository.

```bash
bun run strategy:nothing-ever-happens -- \
  --csv data/market-snapshots-v2.csv --side no --category Sports

# Alternatively, query the Gamma closed-market feed
bun run strategy:nothing-ever-happens:resolved -- \
  --lookback-hours 336 --limit 2000
```

The CSV verifier writes `data/nothing-ever-happens-report.md` and caches outcomes
in `data/market-outcome-cache.json`. The report includes calibration statistics
(win rate against entry price, a confidence interval, a z-score, and expiry buckets)
and states how many examined markets resolved. A high NO win rate alone does not
demonstrate profitability: entry prices, sampling, unresolved outcomes, fees, and
liquidity matter.

## Interpreting pricing signals

For equal shares of complementary YES and NO tokens in the same binary condition,
combined purchase cost below $1 is a **gross pricing signal**. Realized profit
also depends on both legs filling, fees, slippage, and settlement.

For example, 100 YES at $0.48 and 100 NO at $0.50 cost $98 before fees.
A $100 combined payout would leave $2 gross. A quoted book does not guarantee
those fills. Batch FOK orders apply all-or-nothing to each order individually;
the pair is not atomic, and one leg can fill while the other fails.

Fees vary by market. Check the market's current parameters and
[Polymarket's fee documentation](https://docs.polymarket.com/trading/fees).
Do not use a universal “0% fees” or “2% of profits” assumption.
Cross-platform title similarity also does not establish matching resolution rules.

## Project layout

| Path | Contents |
| --- | --- |
| `cpp/src/`, `cpp/include/` | C++ libraries: market stream, discovery options, strategy math, slippage sweep, contract addresses |
| `cpp/apps/research/` | `discovery_mode`: public data only, never places orders |
| `cpp/apps/execution/` | Credentialed execution experiments (legacy CLOB V1, not validated) |
| `cpp/tests/` | Offline CTest suite |
| `src/core/`, `src/services/` | Shared types, contract addresses, market data, collector, retrying HTTP client |
| `src/cli/research/` | Public-data entry points: collect, analyze, latency test |
| `src/cli/execution/` | Credentialed smoke tests and tools (signing, orders, redemption) |
| `src/stats/` | Live statistics collector |
| `src/strategies/` | Experimental execution strategies |
| `research/nothing-ever-happens/` | Historical outcome verification with calibration statistics |
| `research/artifacts/` | Dated historical CSVs and plots (see its README) |
| `deploy/` | Dockerfiles, compose file, entrypoints, GCloud deploy script |
| `scripts/` | Repository tooling (hygiene check, SDK update helper) |
| `tests/` | Offline Bun tests |
| `data/` | Local data and reports, ignored by Git |

## Safety defaults

- Every container, compose file and deploy script defaults to a **dry run**. Going live needs
  `DRY_RUN=false` **and** `CONFIRM_LIVE_TRADING=yes`; the entrypoints refuse to start otherwise.
- The redemption service never sends a transaction unless `DRY_RUN=false`. Neg-risk redemption
  is disabled until it is re-implemented against the current adapter (see
  [maintenance](docs/maintenance.md)).
- On GCP the wallet key is read from Secret Manager at container start; it is not stored in
  instance metadata or container environment. See [deploy/README.md](deploy/README.md).

## Research notes

- [Market discovery findings](docs/market-discovery-findings.md)
- [Dead-outcome strategy](docs/dead-outcome-strategy.md)
- [Weather strategy discovery](docs/weather-strategy-discovery.md)
- [Maintenance and compatibility](docs/maintenance.md)
- [Research roadmap](docs/research-roadmap.md)
- [Research data and verification](docs/research-data.md)
- [Changelog](CHANGELOG.md)

These notes preserve earlier investigations. Their dates and assumptions matter;
they are not evidence that a strategy currently works.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and research expectations.
Report reproducible bugs or propose a focused investigation through
[Issues](https://github.com/chrislernunes/prediction_markets_research/issues).
Coding agents should start with [AGENTS.md](AGENTS.md).
For sensitive reports, follow [SECURITY.md](SECURITY.md).

## License and disclaimer

[MIT](LICENSE). This independent project is not affiliated with Polymarket. Experimental execution can lose funds. Respect platform terms and geographic
restrictions; a proxy or VPN does not establish trading eligibility.
