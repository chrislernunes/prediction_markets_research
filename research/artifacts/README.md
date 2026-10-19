# Historical research artifacts

Dated outputs kept for reference. They are **not** current performance claims and are not
produced by any command that runs today without extra setup.

## `stats-summary/`

Rolling CSV output of `src/stats/stats.ts` (`bun run stats`), first rows dated January 2026.
The summary file and its `-buckets`, `-duration*`, `-liquidity`, `-lowprice`, `-nearprice`,
`-momentum` and `-spotlag` siblings were written to the repository root before the layout
cleanup; new runs write to `data/stats/` (ignored by Git, override with `STATS_OUT_CSV`).

`stats-summary-spotlag.csv` contains only a header: the spot-lag signal produced no rows in
that run, so it supports no conclusion.

## `plots/`

PNG plots from the same period. **No script in this repository regenerates them**
(`bun run plots` runs the same summary as `bun run analyze`). Treat them as screenshots of
an earlier analysis; regenerate with documented data and methodology before relying on them.
