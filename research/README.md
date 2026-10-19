# research/

Analysis that answers a question about collected data, as opposed to the collection code
itself (`src/cli/research/`) or execution experiments.

| Path | Contents |
| --- | --- |
| `nothing-ever-happens/` | Verifies an "always take the same side" hypothesis against resolved outcomes, with calibration statistics |
| `artifacts/` | Dated historical CSVs and plots kept for reference |

Run the verifier with `bun run strategy:nothing-ever-happens -- --csv data/market-snapshots-v2.csv`.
Its report states its own sample limits; read them before quoting a result.
