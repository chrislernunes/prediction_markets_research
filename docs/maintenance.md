# Maintenance and compatibility.

## Verified maintenance baseline

The October 2026 refresh pins polymarket-cpp-client to v3.0.0, migrates includes
to its public polymarket/ namespace, and makes CI run the offline C++ suite.
TypeScript dependencies and transitives are refreshed within compatible ranges.
Bun types stay pinned to 1.3.5: the newer 1.4.x declarations reject existing
process signal handlers with the resolved Node types. The redundant @types/bun
package is removed. Direct imports of order-utils, ethers, and ws are declared
explicitly rather than relying on the client's transitive dependencies. The
order-utils package preserves legacy signing experiments; it is not evidence of
current V2 compatibility. A wholesale SDK migration remains separate work.

The refreshed lockfile reduces bun audit findings from 67 to 27 (11 high,
14 moderate, 2 low). Remaining reports involve axios 0.x, ws, and elliptic
through upstream SDK dependencies. This is not a clean security audit.
Resolve these through upstream SDK migrations and targeted compatibility checks;
do not force incompatible transitive versions merely to suppress reports.

## October 19, 2026 audit remediation

A repository audit led to these changes. Items marked *open* are known gaps, not fixed.

**Safety**

- Images, compose and the GCloud script default to a dry run; live needs `DRY_RUN=false` and
  `CONFIRM_LIVE_TRADING=yes`. The combined image used to default to live, and the deploy
  script defaulted `DRY_RUN` to `false`.
- The redemption service ignored `DRY_RUN` and would send transactions in a "dry" container.
  It now sends nothing unless `dryRun: false` is passed (`DRY_RUN=false` from the CLI).
- The wallet key moved from `--container-env` (instance metadata) to Secret Manager.
- The entrypoint restarts with backoff and gives up after a crash loop instead of
  restarting forever with `|| true`.
- Release builds no longer use `-march=native` by default.
- The SDK is pinned by commit, and configure no longer force-checks the remote.
- Container health checks used `pgrep`, which `debian:bookworm-slim` does not ship; the
  runtime stages now install `procps`. (Not verified by running the images here.)
- `stats.ts` truncated its CSV when the header changed; it now renames the old file to
  `*.bak-<timestamp>`.
- Invalid sysctls (`tcp_low_latency`, `tcp_nodelay`) were dropped from the VM startup script.

**Correctness**

- *Neg-risk redemption is disabled (open).* The legacy code sent a CTF-style
  `redeemPositions` call to `0xC5d5…` (the V1 Neg Risk CTF **Exchange**) labelled as the Neg
  Risk Adapter. The adapter is `0xd91E…`, and its redeem function has a different ABI. Both
  redemption paths now skip neg-risk positions with an explanation. Standard-market
  redemption still uses USDC.e as collateral, which predates the V2 collateral token; treat it
  as legacy too.
- Contract addresses live in `src/core/contracts.ts` and `cpp/include/contracts.hpp`, checked
  against the official contract page on the date in the file header. V1 and V2 sets are
  separate. The execution experiments still use V1 (*open*: V2 order signing and collateral).
- C++ arbitrage depth is measured in bundles, not per-leg dollars, and the paper projection
  is capped at visible depth. Signals are re-priced against the full ladders so one edge is
  reported; rejected signals are logged.

**Data pipeline**

- Quote failures carry reason codes, and every scan records coverage. *Open:* one-sided books
  are still rejected, not recorded as one-sided quotes. The failure log keeps them countable.
- Scan IDs are run-scoped; JSONL rotates daily and compresses; each run writes a manifest.
- HTTP requests retry transient errors with backoff and honor `Retry-After`.
- The verifier reports calibration statistics and its sample limits.

**Layout and hygiene**

- Empty stub files and a stray C++ file under `src/` were removed. `scripts/check-repo.sh`
  now fails CI on zero-byte files, C++ outside `cpp/`, and hard-coded addresses.
- Folders were reorganized into `src/cli/{research,execution}`, `research/`, `deploy/` and
  `cpp/apps/{research,execution}`.
- CI gained shell lint, a repository check, an advisory `bun audit`, ccache, a Docker build
  job that checks the dry-run default, and Dependabot for Bun and Docker.

**Still open**

- Files over the 300-line guideline: `src/stats/stats.ts` (1,290 lines, untested), several C++
  execution apps (550 to 900 lines), `src/index.ts`, `src/strategies/laddering.ts`,
  `src/cli/execution/arb-smoke.ts`, `src/strategies/market-maker.ts`,
  `src/services/opportunity-finder.ts`, `src/services/redemption-service.ts`,
  `src/cli/execution/redeem-positions.ts`, `src/strategies/dead-outcome.ts`, `src/core/gamma.ts`.
- No direct tests for `opportunity-finder`, `stats.ts`, the strategies, or the verifier's
  top-level run. The C++ execution apps compile in CI but are not exercised.
- No lint or formatter is configured for TypeScript or C++.
- The Secret Manager deployment and the Docker images were written and syntax-checked but not
  run against real infrastructure.

## Execution compatibility work

Before claiming current live support:

1. Replace manually serialized legacy C++ orders with SDK V2 order helpers.
2. Resolve exchange contracts and fee metadata through the SDK rather than
   hard-coded historical addresses or universal fee assumptions.
3. Review TypeScript clob-client and real-time-data-client usage against the
   current official SDK and streaming migration guides.
4. Verify each strategy's dry-run, eligibility, error handling, order lifecycle,
   and one-leg exposure handling with focused tests.
5. Validate live behavior only with explicit authorization and bounded scope.

The existing tools are research experiments. Batch FOK orders do not make a
YES/NO pair atomic. Compilation and offline strategy calculations cannot prove
that orders settle, fees are modeled correctly, or a strategy is profitable.

References:

- SDK CLOB V2 migration notes in the pinned polymarket-cpp-client (`docs/clob-v2-migration.md`)
- [Official SDK migration](https://docs.polymarket.com/)
- [Current fee model](https://docs.polymarket.com/trading/fees)

## Routine maintenance

For each dependency change, update its pin and lockfile together where applicable,
run the documented checks, and inspect upstream API changes. C++ SDK upgrades
must build every lab target, not only discovery_mode.

GitHub Actions, Bun packages and Docker base images are proposed by Dependabot; review each
against the compatibility notes above (for example the `bun-types` pin). Historical plots and CSVs
remain dated artifacts; regenerate them only with documented data and methodology.

Use small pull requests for confirmed defects. Avoid broad strategy rewrites or
new benchmarks without a concrete question and a reproducible success check.
