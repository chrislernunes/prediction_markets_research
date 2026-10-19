import { createReadStream, createWriteStream, appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function datedJsonlName(base: string, day: string): string {
  return `${base}-${day}.jsonl`;
}

async function gzipFile(path: string): Promise<void> {
  const tmp = `${path}.gz.tmp`;
  await pipeline(createReadStream(path), createGzip(), createWriteStream(tmp));
  renameSync(tmp, `${path}.gz`);
  unlinkSync(path);
}

/**
 * Append-only JSONL writer that starts a new file each UTC day and gzips finished
 * days in the background, so long collections stay bounded and every file is
 * self-contained. Files are named `<base>-YYYY-MM-DD.jsonl` (`.gz` once compressed).
 */
export class RotatingJsonl {
  private currentDay: string | null = null;
  private pending: Promise<void> = Promise.resolve();
  readonly errors: unknown[] = [];

  constructor(
    private readonly dir: string,
    private readonly base: string,
    private readonly compress = true,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  pathFor(day: string): string {
    return join(this.dir, datedJsonlName(this.base, day));
  }

  append(text: string, now = new Date()): string {
    const day = utcDay(now);
    if (this.currentDay !== day) {
      this.currentDay = day;
      if (this.compress) this.compressFinishedDays(day);
    }
    const path = this.pathFor(day);
    if (text.length > 0) appendFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
    return path;
  }

  /** Gzips every uncompressed day other than `today`; also catches files left by a crashed run. */
  private compressFinishedDays(today: string): void {
    if (!existsSync(this.dir)) return;
    const pattern = new RegExp(`^${this.base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`);
    for (const name of readdirSync(this.dir)) {
      const match = pattern.exec(name);
      if (!match || match[1] === today) continue;
      const path = join(this.dir, name);
      this.pending = this.pending.then(() => gzipFile(path)).catch((error) => {
        this.errors.push(error);
        console.error(`[jsonl-store] could not compress ${path}:`, error);
      });
    }
  }

  /** Resolves when background compression has finished. Call before exiting. */
  flush(): Promise<void> {
    return this.pending;
  }
}
