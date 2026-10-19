import { EXPIRY_BUCKETS, expiryBucket, summarizeCalibration, type CalibrationSummary } from "./calibration";
import type { ScriptArgs, CategoryBuckets, CounterMap, MarketEval } from "./types";

function safePct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderCategoryTable(categoryBuckets: CategoryBuckets): string[] {
  const lines = [
    "## Performance by category",
    "",
    "| Category | Markets | Win Rate | Total PnL | Avg PnL | Avg Return | Avg Entry |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];

  const entries = Object.entries(categoryBuckets);
  if (entries.length === 0) {
    lines.push("No category data for this filtered set.");
    lines.push("");
    return lines;
  }

  const ordered = entries.sort((a, b) => b[1].length - a[1].length);
  for (const [category, rows] of ordered) {
    if (rows.length === 0) continue;
    const total = rows.length;
    const wins = rows.filter((item) => item.won).length;
    const avgEntry = mean(rows.map((item) => item.entryPrice));
    const avgReturn = mean(rows.map((item) => item.ret));
    const totalPnl = rows.reduce((sum, item) => sum + item.pnl, 0);
    const avgPnl = totalPnl / total;
    const winRate = safePct(wins, total);

    lines.push(
      `| \`${category}\` | ${total} | ${winRate.toFixed(1)}% | ${totalPnl.toFixed(2)} | ${avgPnl.toFixed(2)} | ${avgReturn.toFixed(2)}% | ${avgEntry.toFixed(4)} |`
    );
  }

  lines.push("");
  return lines;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function calibrationRow(label: string, summary: CalibrationSummary): string {
  const interval = summary.winRateInterval ? `${pct(summary.winRateInterval.lower)} to ${pct(summary.winRateInterval.upper)}` : "n/a";
  const z = summary.z === null ? "n/a" : summary.z.toFixed(2);
  return `| ${label} | ${summary.n} | ${pct(summary.winRate)} | ${interval} | ${pct(summary.meanEntry)} | ${(summary.edge * 100).toFixed(1)} pp | ${z} | ${(summary.grossReturn * 100).toFixed(1)}% |`;
}

function renderCalibration(results: MarketEval[], counters: CounterMap): string[] {
  const overall = summarizeCalibration(results);
  const header = [
    "| Group | n | Win rate | 95% interval | Mean entry | Edge | z | Gross return |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  const lines = [
    "## Calibration (does the side win more often than its entry prices implied?)",
    "",
    "Edge is win rate minus mean entry price; z compares observed wins with the wins the entry prices implied (|z| below 2 is ordinary noise). Returns are gross of fees and assume a fill at the first observed ask.",
    "",
    ...header,
    calibrationRow("all", overall),
  ];
  for (const bucket of EXPIRY_BUCKETS) {
    const rows = results.filter((item) => expiryBucket(item.hoursToExpiry) === bucket);
    if (rows.length > 0) lines.push(calibrationRow(`expiry ${bucket}`, summarizeCalibration(rows)));
  }

  const resolved = counters.resolved ?? results.length;
  const unresolved = counters.unresolved ?? 0;
  const examined = resolved + unresolved;
  lines.push("", "### Sample limits", "");
  lines.push(`- Resolved ${resolved} of ${examined} examined markets (${examined > 0 ? pct(resolved / examined) : "n/a"}). Unresolved markets are excluded, so results describe only markets that resolved during the observation window and lean toward short-dated ones.`);
  lines.push("- Entry is the first snapshot the collector recorded for each market, not a fixed time before expiry; see the expiry buckets above.");
  lines.push("- Markets are treated as independent. Outcomes within one event are correlated, so the intervals are narrower than they should be.");
  lines.push("");
  return lines;
}

export function renderMarkdown(
  results: MarketEval[],
  args: ScriptArgs,
  counters: CounterMap,
  categoryBuckets: CategoryBuckets,
): string {
  if (results.length === 0) {
    return "# Nothing-ever-happens strategy check\n\nNo resolved markets met filters.\n";
  }

  const wins = results.filter((item) => item.won).length;
  const winRate = safePct(wins, results.length);
  const avgRet = mean(results.map((item) => item.ret));
  const totalPnl = results.reduce((sum, item) => sum + item.pnl, 0);
  const avgPnl = results.length > 0 ? totalPnl / results.length : 0;
  const avgEntry = mean(results.map((item) => item.entryPrice));

  const lines = [
    "# Nothing-ever-happens strategy check",
    "",
    `- Side tested: \`${args.side.toUpperCase()}\``,
    `- Category filter: \`${args.category || "all"}\``,
    `- Evaluated markets: \`${results.length}\``,
    `- Win rate: \`${winRate.toFixed(2)}%\` (${wins}/${results.length})`,
    `- Total PnL (fixed ${args.stake.toFixed(2)} USDC each): \`${totalPnl.toFixed(2)}\``,
    `- Avg PnL per trade: \`${avgPnl.toFixed(2)}\``,
    `- Avg return: \`${avgRet.toFixed(2)}%\``,
    `- Avg entry price: \`${avgEntry.toFixed(4)}\``,
    "",
    `- Skipped (filter): \`${counters.filtered}\``,
    `- Skipped (category filter): \`${counters.category_filtered}\``,
    `- Skipped (invalid entry): \`${counters.invalid_entry}\``,
    `- Skipped (unresolved/not available): \`${counters.unresolved}\``,
    "",
    ...renderCalibration(results, counters),
    ...renderCategoryTable(categoryBuckets),
    "## Top and bottom outcomes",
  ];

  const sorted = [...results].sort((a, b) => b.ret - a.ret);
  for (const item of sorted.slice(0, 10)) {
    const status = item.won ? "✅" : "❌";
    lines.push(
      `${status} ${item.side.toUpperCase()} on ${item.slug || item.marketId} | entry ${item.entryPrice.toFixed(4)} | category ${item.category} | outcome ${item.outcome} | pnl ${item.pnl.toFixed(2)} (${item.ret.toFixed(2)}%)`
    );
  }

  lines.push("\n## Worst outcomes");
  for (const item of sorted.slice(-10).reverse()) {
    const status = item.won ? "✅" : "❌";
    lines.push(
      `${status} ${item.side.toUpperCase()} on ${item.slug || item.marketId} | entry ${item.entryPrice.toFixed(4)} | category ${item.category} | outcome ${item.outcome} | pnl ${item.pnl.toFixed(2)} (${item.ret.toFixed(2)}%)`
    );
  }

  return `${lines.join("\n")}\n`;
}
