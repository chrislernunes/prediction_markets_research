import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { CategoryStats, NormalizedMarket } from "../market-data/types";

/** A market that reached the CSV writer without an executable spread. */
export interface SkippedRow {
  marketId: string;
  reason: "missing_spread";
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export const MARKET_HEADER =
  [
    "timestamp",
    "scan_id",
    "platform",
    "id",
    "title",
    "category",
    "tags",
    "slug",
    "yes_price",
    "no_price",
    "combined",
    "spread",
    "spread_pct",
    "volume",
    "liquidity",
    "end_date",
    "hour_utc",
    "session",
    "day_of_week",
  ].join(",") + "\n";

export const CATEGORY_HEADER =
  ["timestamp", "scan_id", "platform", "category", "count", "avg_spread", "avg_spread_pct", "avg_volume", "total_volume", "hour_utc", "session"].join(",") +
  "\n";

export const SPREAD_HEADER =
  ["timestamp", "scan_id", "platform", "id", "title", "category", "yes_price", "no_price", "combined", "spread_pct", "hour_utc", "session"].join(",") + "\n";

export function getSession(hourUTC: number): string {
  if (hourUTC >= 0 && hourUTC < 7) return "asia";
  if (hourUTC >= 7 && hourUTC < 8) return "overlap_asia_eu";
  if (hourUTC >= 8 && hourUTC < 13) return "europe";
  if (hourUTC >= 13 && hourUTC < 16) return "overlap_eu_us";
  if (hourUTC >= 16 && hourUTC < 22) return "us";
  return "asia";
}

export function initCsv(path: string, header: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, header);
  }
}

// ─── Snapshot Writer ─────────────────────────────────────────────────────────

export function writeMarketRows(markets: NormalizedMarket[], scanId: string, marketFile: string, spreadFile: string): SkippedRow[] {
  let marketBuf = "";
  let spreadBuf = "";
  const skipped: SkippedRow[] = [];

  for (const m of markets) {
    const received = new Date(m.receivedAt);
    const hourUTC = received.getUTCHours();
    const session = getSession(hourUTC);
    const dayOfWeek = received.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const combined = m.yesPrice + m.noPrice;
    if (m.spread === null) {
      // One unquoted market must not discard the rest of the scan; surface it instead.
      skipped.push({ marketId: m.id, reason: "missing_spread" });
      continue;
    }
    const midpoint = m.yesPrice - m.spread / 2;
    const spreadPct = (m.spread / midpoint) * 100;

    marketBuf +=
      [
        m.receivedAt,
        scanId,
        m.platform,
        csvEscape(m.id),
        csvEscape(m.title),
        csvEscape(m.category),
        csvEscape(m.tags.join(";")),
        csvEscape(m.slug),
        m.yesPrice.toFixed(4),
        m.noPrice.toFixed(4),
        combined.toFixed(4),
        m.spread.toFixed(4),
        spreadPct.toFixed(2),
        m.volume.toFixed(0),
        m.liquidity.toFixed(0),
        m.endDate ?? "",
        hourUTC,
        session,
        dayOfWeek,
      ].join(",") + "\n";

    // Only write spread timeseries for markets with real prices
    if (m.yesPrice > 0 && m.noPrice > 0 && m.yesPrice < 1 && m.noPrice < 1) {
      spreadBuf +=
        [
          m.receivedAt,
          scanId,
          m.platform,
          csvEscape(m.id),
          csvEscape(m.title),
          csvEscape(m.category),
          m.yesPrice.toFixed(4),
          m.noPrice.toFixed(4),
          combined.toFixed(4),
          spreadPct.toFixed(2),
          hourUTC,
          session,
        ].join(",") + "\n";
    }
  }

  appendFileSync(marketFile, marketBuf);
  appendFileSync(spreadFile, spreadBuf);
  return skipped;
}

export function writeCategoryRows(stats: CategoryStats[], scanId: string, ts: Date, catFile: string): void {
  const hourUTC = ts.getUTCHours();
  const session = getSession(hourUTC);
  const isoTs = ts.toISOString();

  let buf = "";
  for (const cat of stats) {
    const spreadPct = cat.avgSpread * 100;
    buf +=
      [
        isoTs,
        scanId,
        cat.platform,
        csvEscape(cat.category),
        cat.count,
        cat.avgSpread.toFixed(4),
        spreadPct.toFixed(2),
        cat.avgVolume.toFixed(0),
        cat.totalVolume.toFixed(0),
        hourUTC,
        session,
      ].join(",") + "\n";
  }
  appendFileSync(catFile, buf);
}

