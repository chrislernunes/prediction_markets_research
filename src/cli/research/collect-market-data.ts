/**
 * Long-running market data collector.
 *
 * Periodically snapshots ALL Polymarket markets (all categories) with real
 * CLOB orderbook prices, plus Kalshi markets, and appends rows to CSV files
 * for offline analysis.
 *
 * Outputs:
 *   market-snapshots-v2.csv   — per-market row every scan (id, title, category, prices, spread, volume, ...)
 *   category-snapshots-v2.csv — per-category aggregate every scan
 *   spread-timeseries-v2.csv  — lightweight per-market spread+combined over time (for time-pattern analysis)
 *   market-observations-<day>.jsonl(.gz) — raw normalized records with both full books (rotated daily)
 *   quote-failures-<day>.jsonl(.gz)      — every market that produced no quote, with a reason code
 *   scan-summaries-<day>.jsonl(.gz)      — per-scan candidates/quoted/failed counts and coverage
 *   manifests/<runId>.json               — commit, schema version, selection rule, scan counts
 *
 * Usage:
 *   bun run collect                                    # default 5min interval
 *   INTERVAL_MS=120000 MAX_PAGES=15 bun run collect    # 2min, more markets
 *
 * Env:
 *   INTERVAL_MS=300000       Scan interval (default 5 min)
 *   MAX_PAGES=10             Polymarket pages to fetch
 *   INCLUDE_KALSHI=true      Include Kalshi data
 *   OUT_DIR=./data            Output directory for CSVs
 */

import { RotatingJsonl } from "../../core/jsonl-store";
import { ensureDir, initCsv, CATEGORY_HEADER, MARKET_HEADER, SPREAD_HEADER } from "../../services/collector/csv-export";
import { gitCommit, makeRunId, OBSERVATION_SCHEMA_VERSION, writeManifest, type RunManifest } from "../../services/collector/run-manifest";
import { runScan, type ScanContext } from "../../services/collector/scan";

const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? "300000"); // 5 min
const MAX_PAGES = Number(process.env.MAX_PAGES ?? "10");
const INCLUDE_KALSHI = process.env.INCLUDE_KALSHI !== "false";
const OUT_DIR = process.env.OUT_DIR ?? "./data";
const MARKETS_PER_PAGE = 50;
const KALSHI_LIMIT = 200;

async function main(): Promise<void> {
  if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0 || !Number.isInteger(MAX_PAGES) || MAX_PAGES <= 0) {
    throw new Error("INTERVAL_MS must be positive; MAX_PAGES must be a positive integer");
  }
  ensureDir(OUT_DIR);

  const runId = makeRunId();
  const files = {
    market: `${OUT_DIR}/market-snapshots-v2.csv`,
    category: `${OUT_DIR}/category-snapshots-v2.csv`,
    spread: `${OUT_DIR}/spread-timeseries-v2.csv`,
  };
  initCsv(files.market, MARKET_HEADER);
  initCsv(files.category, CATEGORY_HEADER);
  initCsv(files.spread, SPREAD_HEADER);

  const ctx: ScanContext = {
    runId,
    maxPages: MAX_PAGES,
    includeKalshi: INCLUDE_KALSHI,
    kalshiLimit: KALSHI_LIMIT,
    files,
    observations: new RotatingJsonl(OUT_DIR, "market-observations"),
    failures: new RotatingJsonl(OUT_DIR, "quote-failures"),
    summaries: new RotatingJsonl(OUT_DIR, "scan-summaries"),
  };

  const manifest: RunManifest = {
    runId,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    endedAt: null,
    commit: gitCommit(),
    runtime: typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`,
    selection: { polymarketPages: MAX_PAGES, marketsPerPage: MARKETS_PER_PAGE, includeKalshi: INCLUDE_KALSHI, kalshiLimit: KALSHI_LIMIT },
    intervalMs: INTERVAL_MS,
    outDir: OUT_DIR,
    scans: 0,
    failedScans: 0,
  };
  writeManifest(OUT_DIR, manifest);

  console.log("=== MARKET DATA COLLECTOR ===\n");
  console.log(`Run:      ${runId}${manifest.commit ? ` (commit ${manifest.commit.slice(0, 8)})` : ""}`);
  console.log(`Interval: ${INTERVAL_MS / 1000}s`);
  console.log(`Pages: ${MAX_PAGES} (≈${MAX_PAGES * MARKETS_PER_PAGE} markets, in Gamma's default order, not a random sample)`);
  console.log(`Kalshi: ${INCLUDE_KALSHI ? "✅" : "❌"}`);
  console.log(`Output: ${OUT_DIR}/  (manifest: manifests/${runId}.json)`);
  console.log(`\nCollecting... Press Ctrl+C to stop.\n`);

  const doScan = async () => {
    const sequence = manifest.scans + manifest.failedScans + 1;
    const start = Date.now();
    try {
      const summary = await runScan(ctx, sequence);
      manifest.scans++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const { candidates, quoted, failed, coverage } = summary.polymarket;
      const pct = coverage === null ? "n/a" : `${(coverage * 100).toFixed(1)}%`;
      console.log(
        `[${new Date().toISOString()}] Scan ${summary.scanId}: quoted ${quoted}/${candidates} Polymarket (${pct}, ${failed} failed ` +
          `${JSON.stringify(summary.polymarket.failuresByReason)}), ${summary.kalshiRows} Kalshi (${elapsed}s)`,
      );
    } catch (err) {
      manifest.failedScans++;
      console.error(`[${new Date().toISOString()}] Scan ${sequence} FAILED:`, err);
    }
    writeManifest(OUT_DIR, manifest);
  };

  const stop = new AbortController();
  const onStop = () => stop.abort();
  process.once("SIGINT", onStop);
  process.once("SIGTERM", onStop);
  try {
    while (!stop.signal.aborted) {
      await doScan();
      if (stop.signal.aborted) break;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          stop.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, INTERVAL_MS);
        stop.signal.addEventListener("abort", done, { once: true });
      });
    }
  } finally {
    process.removeListener("SIGINT", onStop);
    process.removeListener("SIGTERM", onStop);
    await Promise.all([ctx.observations.flush(), ctx.failures.flush(), ctx.summaries.flush()]);
    manifest.endedAt = new Date().toISOString();
    writeManifest(OUT_DIR, manifest);
    console.log(`Stopped after ${manifest.scans + manifest.failedScans} scans (${manifest.failedScans} failed). Data saved to ${OUT_DIR}/`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
