# Changelog

## 2026-10-19: audit remediation and restructure

See [docs/maintenance.md](docs/maintenance.md#october-19-2026-audit-remediation) for the full
list, including what remains open.

### Changed (breaking paths)

- `src/scripts/*` moved to `src/cli/research/` (collect, analyze, latency) and
  `src/cli/execution/` (credentialed smoke tests and tools).
- `scripts/nothing-ever-happens/` moved to `research/nothing-ever-happens/`.
- `plots/` and `stats-summary*.csv` moved to `research/artifacts/`; `stats.ts` now writes to
  `data/stats/` by default.
- Dockerfiles, compose file, entrypoints and the GCloud script moved to `deploy/`.
- C++ executables moved from `cpp/src/` to `cpp/apps/{research,execution}/`; `main.cpp` is now
  `polymarket_arb.cpp`.
- Collector output: scan IDs are `<runId>-<n>`; JSONL files are `<name>-<UTC day>.jsonl(.gz)`;
  observation `schemaVersion` is 2.
- C++ `top_depth_usdc` and `executable_depth_usdc` are bundle costs; `paper_trade` gained
  `requested_stake_usdc` and `depth_limited`.

### Added

- Run manifests, per-scan coverage summaries, reason-coded quote failures, daily JSONL
  rotation with gzip, retrying HTTP client with backoff.
- Calibration statistics (Wilson intervals, z-score, expiry buckets) in the verifier report.
- `src/core/contracts.ts` and `cpp/include/contracts.hpp`.
- `refine_binary_arb_with_depth` and `signal_rejected` events in `discovery_mode`.
- `scripts/check-repo.sh`, `.env.example`, `.bun-version`, Docker CI job, folder READMEs.
- 32 new Bun tests (194 to 226: retry, rotation, scan, calibration, contracts, failure reasons) and
  C++ tests for the depth gate, sweep refinement and contracts.

### Fixed

- Combined image and deploy script no longer default to live trading; live needs
  `CONFIRM_LIVE_TRADING=yes`.
- Redemption service honors `DRY_RUN`; neg-risk redemption fails closed (wrong contract and ABI).
- Wallet key no longer passed through instance metadata; crash loops are bounded.
- `-march=native` is opt-in; the SDK is pinned by commit.
- `stats.ts` no longer truncates data on a header change.
- Arbitrage depth gate measured in bundles; paper trades capped at visible depth.
- Removed zero-byte stubs and a dead duplicate C++ file; health checks install `procps`.
