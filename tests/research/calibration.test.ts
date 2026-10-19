import { describe, expect, test } from "bun:test";
import { expiryBucket, hoursUntil, summarizeCalibration, wilsonInterval } from "../../research/nothing-ever-happens/calibration";
import { renderMarkdown } from "../../research/nothing-ever-happens/report";
import type { MarketEval, ScriptArgs } from "../../research/nothing-ever-happens/types";

describe("wilsonInterval", () => {
  test("matches the textbook interval for 50/100", () => {
    const interval = wilsonInterval(50, 100)!;
    expect(interval.lower).toBeCloseTo(0.4038, 3);
    expect(interval.upper).toBeCloseTo(0.5962, 3);
  });
  test("stays inside [0,1] at the extremes and is null for no data", () => {
    const all = wilsonInterval(10, 10)!;
    expect(all.upper).toBeLessThanOrEqual(1);
    expect(all.lower).toBeGreaterThan(0.7);
    expect(wilsonInterval(0, 10)!.lower).toBe(0);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe("summarizeCalibration", () => {
  test("a fair coin priced at 0.5 shows no edge", () => {
    const trades = [true, false, true, false].map((won) => ({ entryPrice: 0.5, won }));
    const summary = summarizeCalibration(trades);
    expect(summary.edge).toBe(0);
    expect(summary.z).toBe(0);
    expect(summary.grossReturn).toBeCloseTo(0, 12);
  });

  test("winning every trade priced at 0.5 over four trades gives z = 2", () => {
    const summary = summarizeCalibration([1, 2, 3, 4].map(() => ({ entryPrice: 0.5, won: true })));
    expect(summary.z).toBeCloseTo(2, 12);
    expect(summary.edge).toBeCloseTo(0.5, 12);
    expect(summary.grossReturn).toBeCloseTo(1, 12);
  });

  test("a high win rate at a high price is not edge", () => {
    const trades = Array.from({ length: 100 }, (_, i) => ({ entryPrice: 0.9, won: i < 90 }));
    const summary = summarizeCalibration(trades);
    expect(summary.winRate).toBeCloseTo(0.9, 12);
    expect(summary.edge).toBeCloseTo(0, 12);
    expect(Math.abs(summary.z!)).toBeLessThan(1e-9);
  });

  test("empty input is safe", () => {
    const summary = summarizeCalibration([]);
    expect(summary.n).toBe(0);
    expect(summary.z).toBeNull();
    expect(summary.winRateInterval).toBeNull();
  });
});

describe("expiry buckets", () => {
  test("bucket boundaries", () => {
    expect(expiryBucket(0.5)).toBe("<1h");
    expect(expiryBucket(1)).toBe("1-6h");
    expect(expiryBucket(6)).toBe("6-24h");
    expect(expiryBucket(24)).toBe("1-7d");
    expect(expiryBucket(168)).toBe(">7d");
    expect(expiryBucket(-1)).toBe("unknown");
    expect(expiryBucket(null)).toBe("unknown");
    expect(expiryBucket(Number.NaN)).toBe("unknown");
  });
  test("hoursUntil needs two valid dates", () => {
    expect(hoursUntil("2026-10-19T00:00:00Z", "2026-10-19T06:00:00Z")).toBe(6);
    expect(hoursUntil("bad", "2026-10-19T06:00:00Z")).toBeNull();
    expect(hoursUntil(undefined, "2026-10-19T06:00:00Z")).toBeNull();
  });
});

describe("report", () => {
  const args: ScriptArgs = { csv: "x.csv", out: "o.md", cache: "c.json", side: "no", stake: 10, marketFilter: "", category: "", maxMarkets: 0, pauseMs: 0, dryRun: false };
  const row = (won: boolean, hoursToExpiry: number | null): MarketEval => ({
    marketId: "m", title: "t", slug: "s", category: "Sports", side: "no", entryPrice: 0.8, hoursToExpiry, outcome: won ? "no" : "yes", won, pnl: won ? 2.5 : -10, ret: won ? 25 : -100,
  });
  test("includes calibration, expiry buckets, and the censoring warning", () => {
    const results = [row(true, 0.5), row(true, 12), row(false, null)];
    const md = renderMarkdown(results, args, { filtered: 0, category_filtered: 0, invalid_entry: 0, unresolved: 7, resolved: 3 }, { Sports: results });
    expect(md).toContain("## Calibration");
    expect(md).toContain("expiry <1h");
    expect(md).toContain("expiry unknown");
    expect(md).toContain("Resolved 3 of 10 examined markets (30.0%)");
    expect(md).toContain("Unresolved markets are excluded");
  });
});
