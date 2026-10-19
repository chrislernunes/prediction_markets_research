/**
 * Calibration statistics for "always take side X" checks.
 *
 * A win rate on its own says nothing about edge: buying NO at 0.90 should win about
 * 90% of the time. The question is whether the side wins more often than the entry
 * prices implied, and whether that gap is larger than chance.
 */

export interface Trade {
  entryPrice: number;
  won: boolean;
  hoursToExpiry?: number | null;
}

export interface Interval {
  lower: number;
  upper: number;
}

/** Wilson score interval for a binomial proportion (default 95%). Null when n is 0. */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

export interface CalibrationSummary {
  n: number;
  wins: number;
  winRate: number;
  meanEntry: number;
  /** winRate - meanEntry: positive means the side won more often than its entry prices implied. */
  edge: number;
  winRateInterval: Interval | null;
  /**
   * (wins - sum(p)) / sqrt(sum(p(1-p))): a z-score of observed wins against the wins the entry
   * prices implied, valid for varying entry prices (normal approximation to a Poisson-binomial).
   * Null when the implied variance is zero. |z| < 2 is within ordinary noise.
   */
  z: number | null;
  /** Mean per-trade return on stake (win pays 1/entry - 1, loss pays -1), gross of fees. */
  grossReturn: number;
}

export function summarizeCalibration(trades: Trade[]): CalibrationSummary {
  const n = trades.length;
  const wins = trades.filter((trade) => trade.won).length;
  const sumP = trades.reduce((sum, trade) => sum + trade.entryPrice, 0);
  const variance = trades.reduce((sum, trade) => sum + trade.entryPrice * (1 - trade.entryPrice), 0);
  const returns = trades.map((trade) => (trade.won ? 1 / trade.entryPrice - 1 : -1));
  return {
    n,
    wins,
    winRate: n > 0 ? wins / n : 0,
    meanEntry: n > 0 ? sumP / n : 0,
    edge: n > 0 ? wins / n - sumP / n : 0,
    winRateInterval: wilsonInterval(wins, n),
    z: variance > 0 ? (wins - sumP) / Math.sqrt(variance) : null,
    grossReturn: n > 0 ? returns.reduce((sum, value) => sum + value, 0) / n : 0,
  };
}

export const EXPIRY_BUCKETS = ["<1h", "1-6h", "6-24h", "1-7d", ">7d", "unknown"] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];

export function expiryBucket(hoursToExpiry: number | null | undefined): ExpiryBucket {
  if (hoursToExpiry === null || hoursToExpiry === undefined || !Number.isFinite(hoursToExpiry) || hoursToExpiry < 0) return "unknown";
  if (hoursToExpiry < 1) return "<1h";
  if (hoursToExpiry < 6) return "1-6h";
  if (hoursToExpiry < 24) return "6-24h";
  if (hoursToExpiry < 168) return "1-7d";
  return ">7d";
}

/** Hours from the entry observation to the market's scheduled end; null if either date is unusable. */
export function hoursUntil(entryTimestamp: string | undefined, endDate: string | undefined): number | null {
  if (!entryTimestamp || !endDate) return null;
  const entry = Date.parse(entryTimestamp);
  const end = Date.parse(endDate);
  if (Number.isNaN(entry) || Number.isNaN(end)) return null;
  return (end - entry) / 3_600_000;
}
