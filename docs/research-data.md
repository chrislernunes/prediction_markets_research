# Research data and verification

The October 2026 milestone corrects data interpretation and paper accounting.
It does not validate live execution or profitable strategies.

## Collection

Run `bun run collect`. Existing `MAX_PAGES`, `INTERVAL_MS`, `INCLUDE_KALSHI`,
and `OUT_DIR` environment variables control collection. Stop with Ctrl+C;
the collector completes the current scan before exiting. Scans do not overlap.

Generated records remain under ignored `data/` by default:

- `market-observations-<UTC day>.jsonl` (gzipped once the day ends): schemaVersion 2,
  run ID, scan ID, normalized market, rules, fee metadata when supplied, source and
  receipt time. Polymarket records retain both complete book snapshots, token IDs,
  condition IDs, hashes, and each book's source timestamp and receipt time.
  A new file starts each UTC day, and files left uncompressed by a crashed run are
  compressed on the next start.
- Scan IDs are `<runId>-<sequence>` (for example `20261019T101530Z-00007`). The
  sequence restarts each run, so IDs are unique only together with the run ID, which
  is why it is embedded. Earlier files used bare integers that collided across restarts.
- `quote-failures-<UTC day>.jsonl`: market ID, receipt time, error text, and a reason
  code (`empty_book_side`, `crossed_book`, `invalid_level`, `identity_mismatch`,
  `missing_tokens`, `http_error`, `network_or_timeout`, `unknown`), plus the rejected
  token and the empty side where applicable. Failed complementary quotes are excluded
  from market rows, so this log is the denominator: **one-sided books are rejected, and
  they are most common in longshot and dead-outcome markets**. Count them before
  trusting any result built from the CSVs.
- `scan-summaries-<UTC day>.jsonl`: per scan, Polymarket candidates, quoted, failed,
  `coverage` (quoted / candidates), failures by reason, Kalshi rows, and CSV rows skipped.
- `manifests/<runId>.json`: commit, runtime, schema version, selection rule (pages,
  markets per page, Kalshi settings), interval, scan counts, start and end time.
  The selection is the first `MAX_PAGES * 50` markets in Gamma's default order, not a
  random sample.
- `market-snapshots-v2.csv`, `spread-timeseries-v2.csv`, and
  `category-snapshots-v2.csv`: corrected CSV exports. Historical CSV files are
  left intact and are not appended with the new spread meaning. Their `scan_id`
  column now holds the run-scoped string ID described above; a market with no
  executable spread is skipped and counted instead of aborting the scan.

Requests retry transient failures (network errors, 408/425/429/5xx) with jittered
exponential backoff that honors `Retry-After`; other 4xx responses and malformed JSON
fail immediately.

YES/NO labels (including Up/Down) determine token ordering. Other labeled
contracts are excluded from this binary research view. Discovery skips missing
metadata prices with a warning. Discovery HTTP errors fail the scan. Metadata
prices have source `gamma` and no observed spread; collection requires both
CLOB books before recording a Polymarket executable-price observation.

Prices are asks for both outcomes. Spread is YES ask minus YES bid, rather
than the difference between complementary bundle cost and one dollar.
CSV `spread_pct` is the YES spread divided by the YES midpoint, times 100.
Category `avg_spread_pct` retains the existing convention of average absolute
spread times 100; it is not a midpoint-relative percentage.
Kalshi rows require observed YES/NO asks and YES bid. Kalshi quote sizes and
exchange source timestamps are not captured by this milestone. The Kalshi
limit bounds examined contracts, including rejected multivariate or unquoted
markets; a scan can return fewer rows or none.

Book source timestamps are preserved as supplied by the API. Receipt time
records when the request completed. Two HTTP books are separate observations,
not an atomic snapshot. Freshness gates, depth-based sizing, per-leg fees,
public trade capture, raw response archives, and replay remain future work.

## Outcomes and paper results

Outcome verification uses exact condition IDs, Gamma outcome labels, and
[Data API final resolution payouts](https://docs.polymarket.com/api-reference/markets/get-resolution-state).
A `closed` flag or a price near one is not final settlement evidence.
Legacy cached winner guesses are rechecked. Missing labels, split payouts,
unknown resolutions, and non-final statuses produce no binary winner.
HTTP and malformed-response errors propagate rather than appearing unresolved.

The resolved-history command examines at most `--limit` closed markets.
Its output is a sample by closed time, not a complete resolved-market census.
Outcome rates alone do not establish trading returns or calibration. The verifier report
therefore includes a calibration table: win rate with a Wilson 95% interval, mean entry
price, edge (win rate minus mean entry), a z-score of observed wins against the wins the
entry prices implied, and gross return, overall and by time-to-expiry bucket. It also
states how many examined markets resolved. Unresolved markets are excluded, which biases
the sample toward short-dated markets; entries are the first recorded snapshot, not a
fixed time before expiry; and markets are treated as independent although outcomes within
one event are correlated.
CSV entry observations are ordered by receipt timestamp, including across
collector restarts. Quoted multiline fields are retained.

The C++ complementary bundle projection computes shares as
`stake / (YES ask + NO ask)`, gross payout as shares, and profit as payout
minus stake. Fees and independent fill risk are not modeled.
Cross-platform title matches are contract review candidates; their gross
paired discount is not verified arbitrage. Market-maker dry runs preview
quotes without generating random fills, inventory, or simulated profits.

See [the roadmap](research-roadmap.md) for strategy examples and evaluation work.
