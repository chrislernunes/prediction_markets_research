import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Bump when the shape of market-observations records changes. v2: string run-scoped scan IDs. */
export const OBSERVATION_SCHEMA_VERSION = 2;

/** Compact UTC timestamp, e.g. 20261019T101530Z. Sorts chronologically and is unique per start. */
export function makeRunId(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Scan IDs restart at 1 each run, so they are scoped by run: `<runId>-<n>`. */
export function scanKey(runId: string, sequence: number): string {
  return `${runId}-${String(sequence).padStart(5, "0")}`;
}

export function gitCommit(cwd = process.cwd()): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export interface RunManifest {
  runId: string;
  schemaVersion: number;
  startedAt: string;
  endedAt: string | null;
  commit: string | null;
  runtime: string;
  selection: {
    polymarketPages: number;
    marketsPerPage: number;
    includeKalshi: boolean;
    kalshiLimit: number;
  };
  intervalMs: number;
  outDir: string;
  scans: number;
  failedScans: number;
}

export function writeManifest(outDir: string, manifest: RunManifest): string {
  const dir = join(outDir, "manifests");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${manifest.runId}.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
  return path;
}
