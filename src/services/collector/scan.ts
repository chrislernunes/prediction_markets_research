import type { RotatingJsonl } from "../../core/jsonl-store";
import { computeCategoryStats } from "../market-data/analysis";
import { countFailuresByReason, enrichMarketQuotes, type QuoteFailure, type QuoteFailureReason } from "../market-data/books";
import { fetchAllPolymarketMarkets } from "../market-data/discovery";
import { fetchKalshiMarkets } from "../market-data/kalshi";
import type { NormalizedMarket } from "../market-data/types";
import { writeCategoryRows, writeMarketRows } from "./csv-export";
import { OBSERVATION_SCHEMA_VERSION, scanKey } from "./run-manifest";

export interface CollectorDeps {
  fetchPolymarket(maxPages: number): Promise<NormalizedMarket[]>;
  enrichQuotes(markets: NormalizedMarket[]): Promise<{ markets: NormalizedMarket[]; failures: QuoteFailure[] }>;
  fetchKalshi(limit: number): Promise<NormalizedMarket[]>;
  now(): Date;
}

export const liveDeps: CollectorDeps = {
  fetchPolymarket: fetchAllPolymarketMarkets,
  enrichQuotes: (markets) => enrichMarketQuotes(markets, 15, 150),
  fetchKalshi: fetchKalshiMarkets,
  now: () => new Date(),
};

export interface ScanContext {
  runId: string;
  maxPages: number;
  includeKalshi: boolean;
  kalshiLimit: number;
  files: { market: string; category: string; spread: string };
  observations: RotatingJsonl;
  failures: RotatingJsonl;
  summaries: RotatingJsonl;
  deps?: CollectorDeps;
}

export interface ScanSummary {
  schemaVersion: number;
  runId: string;
  scanId: string;
  startedAt: string;
  finishedAt: string;
  polymarket: {
    candidates: number;
    quoted: number;
    failed: number;
    /** quoted / candidates. Low coverage means the CSVs describe a biased subset. */
    coverage: number | null;
    failuresByReason: Partial<Record<QuoteFailureReason, number>>;
  };
  kalshiRows: number;
  csvRowsSkipped: number;
}

const toLines = (rows: unknown[]): string => rows.map((row) => JSON.stringify(row) + "\n").join("");

/**
 * One full collection pass. Raw JSONL is written first (it is the source of truth), then the
 * derived CSV exports. Every candidate market ends up either quoted or in the failures log,
 * and the per-scan summary records the split so exclusion bias is measurable.
 */
export async function runScan(ctx: ScanContext, sequence: number): Promise<ScanSummary> {
  const deps = ctx.deps ?? liveDeps;
  const startedAt = deps.now();
  const scanId = scanKey(ctx.runId, sequence);

  const candidates = await deps.fetchPolymarket(ctx.maxPages);
  let polymarket: NormalizedMarket[] = [];
  let failures: QuoteFailure[] = [];
  if (candidates.length > 0) {
    const quoted = await deps.enrichQuotes(candidates);
    polymarket = quoted.markets;
    failures = quoted.failures;
  }
  const kalshi = ctx.includeKalshi ? await deps.fetchKalshi(ctx.kalshiLimit) : [];

  const all = [...polymarket, ...kalshi];
  const now = deps.now();
  ctx.failures.append(toLines(failures.map((failure) => ({ schemaVersion: OBSERVATION_SCHEMA_VERSION, runId: ctx.runId, scanId, ...failure }))), now);
  ctx.observations.append(toLines(all.map((market) => ({ schemaVersion: OBSERVATION_SCHEMA_VERSION, runId: ctx.runId, scanId, ...market }))), now);

  const skipped = writeMarketRows(all, scanId, ctx.files.market, ctx.files.spread);
  writeCategoryRows(computeCategoryStats(all), scanId, now, ctx.files.category);

  const summary: ScanSummary = {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    runId: ctx.runId,
    scanId,
    startedAt: startedAt.toISOString(),
    finishedAt: now.toISOString(),
    polymarket: {
      candidates: candidates.length,
      quoted: polymarket.length,
      failed: failures.length,
      coverage: candidates.length > 0 ? polymarket.length / candidates.length : null,
      failuresByReason: countFailuresByReason(failures),
    },
    kalshiRows: kalshi.length,
    csvRowsSkipped: skipped.length,
  };
  ctx.summaries.append(JSON.stringify(summary), now);
  return summary;
}
