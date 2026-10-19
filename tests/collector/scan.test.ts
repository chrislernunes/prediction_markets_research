import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RotatingJsonl } from "../../src/core/jsonl-store";
import { CATEGORY_HEADER, MARKET_HEADER, SPREAD_HEADER, initCsv } from "../../src/services/collector/csv-export";
import { makeRunId, scanKey } from "../../src/services/collector/run-manifest";
import { runScan, type CollectorDeps, type ScanContext } from "../../src/services/collector/scan";
import type { NormalizedMarket } from "../../src/services/market-data/types";
import type { QuoteFailure } from "../../src/services/market-data/books";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "collector-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const at = new Date("2026-10-19T10:00:00Z");

function market(id: string, spread: number | null = 0.02): NormalizedMarket {
  return {
    platform: "polymarket", id, title: `Market ${id}`, category: "Crypto", tags: [], slug: id, yesPrice: 0.5, noPrice: 0.49, spread,
    priceSource: "clob", receivedAt: at.toISOString(), volume: 100, liquidity: 50, endDate: null, active: true, url: "u",
  };
}

function context(deps: CollectorDeps, runId = "run1"): ScanContext {
  const files = { market: join(dir, "m.csv"), category: join(dir, "c.csv"), spread: join(dir, "s.csv") };
  initCsv(files.market, MARKET_HEADER);
  initCsv(files.category, CATEGORY_HEADER);
  initCsv(files.spread, SPREAD_HEADER);
  return {
    runId, maxPages: 1, includeKalshi: false, kalshiLimit: 10, files, deps,
    observations: new RotatingJsonl(dir, "market-observations", false),
    failures: new RotatingJsonl(dir, "quote-failures", false),
    summaries: new RotatingJsonl(dir, "scan-summaries", false),
  };
}

const failure = (marketId: string): QuoteFailure => ({
  marketId, receivedAt: at.toISOString(), error: "BookError: Book has an empty side (bids): t", reason: "empty_book_side", tokenId: "t", emptySide: "bids",
});

const lines = (name: string) => readFileSync(join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));

describe("runScan", () => {
  test("records coverage and keeps every excluded market in the failure log with a reason", async () => {
    const deps: CollectorDeps = {
      fetchPolymarket: async () => [market("a"), market("b"), market("c")],
      enrichQuotes: async () => ({ markets: [market("a"), market("b")], failures: [failure("c")] }),
      fetchKalshi: async () => [],
      now: () => at,
    };
    const summary = await runScan(context(deps), 1);

    expect(summary.scanId).toBe("run1-00001");
    expect(summary.polymarket).toMatchObject({ candidates: 3, quoted: 2, failed: 1, failuresByReason: { empty_book_side: 1 } });
    expect(summary.polymarket.coverage).toBeCloseTo(2 / 3, 12);

    const failures = lines("quote-failures-2026-10-19.jsonl");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ schemaVersion: 2, runId: "run1", scanId: "run1-00001", marketId: "c", reason: "empty_book_side", emptySide: "bids" });

    const observations = lines("market-observations-2026-10-19.jsonl");
    expect(observations.map((o) => o.id)).toEqual(["a", "b"]);
    expect(observations.every((o) => o.scanId === "run1-00001" && o.schemaVersion === 2)).toBe(true);

    expect(lines("scan-summaries-2026-10-19.jsonl")[0].polymarket.quoted).toBe(2);
    expect(readFileSync(join(dir, "m.csv"), "utf8").trim().split("\n")).toHaveLength(3); // header + 2 rows
  });

  test("scan IDs from different runs never collide even though the counter restarts", async () => {
    const deps: CollectorDeps = {
      fetchPolymarket: async () => [market("a")],
      enrichQuotes: async (markets) => ({ markets, failures: [] }),
      fetchKalshi: async () => [],
      now: () => at,
    };
    const first = await runScan(context(deps, makeRunId(new Date("2026-10-19T10:00:00Z"))), 1);
    const second = await runScan(context(deps, makeRunId(new Date("2026-10-19T11:30:00Z"))), 1);
    expect(first.scanId).not.toBe(second.scanId);
    expect(scanKey("r", 7)).toBe("r-00007");
    expect(makeRunId(new Date("2026-10-19T10:15:30.123Z"))).toBe("20261019T101530Z");
  });

  test("one unquoted row is skipped and reported instead of discarding the scan", async () => {
    const deps: CollectorDeps = {
      fetchPolymarket: async () => [market("a"), market("b", null)],
      enrichQuotes: async (markets) => ({ markets, failures: [] }),
      fetchKalshi: async () => [],
      now: () => at,
    };
    const summary = await runScan(context(deps), 1);
    expect(summary.csvRowsSkipped).toBe(1);
    expect(readFileSync(join(dir, "m.csv"), "utf8").trim().split("\n")).toHaveLength(2); // header + 1 row
    expect(lines("market-observations-2026-10-19.jsonl")).toHaveLength(2); // raw data keeps both
  });

  test("an empty candidate list yields null coverage, not a division by zero", async () => {
    const deps: CollectorDeps = {
      fetchPolymarket: async () => [],
      enrichQuotes: async () => { throw new Error("must not be called"); },
      fetchKalshi: async () => [],
      now: () => at,
    };
    const summary = await runScan(context(deps), 1);
    expect(summary.polymarket.coverage).toBeNull();
    expect(readdirSync(dir)).toContain("scan-summaries-2026-10-19.jsonl");
  });
});
