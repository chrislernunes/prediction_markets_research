import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { RotatingJsonl, datedJsonlName, utcDay } from "../../src/core/jsonl-store";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "jsonl-store-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const day1 = new Date("2026-10-18T23:59:00Z");
const day2 = new Date("2026-10-19T00:01:00Z");

describe("RotatingJsonl", () => {
  test("names files by UTC day", () => {
    expect(utcDay(new Date("2026-10-18T23:59:59Z"))).toBe("2026-10-18");
    expect(datedJsonlName("obs", "2026-10-18")).toBe("obs-2026-10-18.jsonl");
  });

  test("appends within a day to one file and ends every record with a newline", () => {
    const store = new RotatingJsonl(dir, "obs");
    store.append('{"a":1}', day1);
    store.append('{"a":2}\n', day1);
    expect(readFileSync(join(dir, "obs-2026-10-18.jsonl"), "utf8")).toBe('{"a":1}\n{"a":2}\n');
  });

  test("gzips a finished day in the background and keeps the new day uncompressed", async () => {
    const store = new RotatingJsonl(dir, "obs");
    store.append('{"day":1}', day1);
    store.append('{"day":2}', day2);
    await store.flush();
    expect(store.errors).toHaveLength(0);
    expect(existsSync(join(dir, "obs-2026-10-18.jsonl"))).toBe(false);
    expect(gunzipSync(readFileSync(join(dir, "obs-2026-10-18.jsonl.gz"))).toString()).toBe('{"day":1}\n');
    expect(readFileSync(join(dir, "obs-2026-10-19.jsonl"), "utf8")).toBe('{"day":2}\n');
  });

  test("compresses files a crashed earlier run left behind and ignores unrelated names", async () => {
    writeFileSync(join(dir, "obs-2026-10-01.jsonl"), '{"old":true}\n');
    writeFileSync(join(dir, "other-2026-10-01.jsonl"), "keep\n");
    const store = new RotatingJsonl(dir, "obs");
    store.append("{}", day2);
    await store.flush();
    expect(readdirSync(dir).sort()).toEqual(["obs-2026-10-01.jsonl.gz", "obs-2026-10-19.jsonl", "other-2026-10-01.jsonl"]);
  });

  test("can leave files uncompressed", async () => {
    const store = new RotatingJsonl(dir, "obs", false);
    store.append("{}", day1);
    store.append("{}", day2);
    await store.flush();
    expect(readdirSync(dir).sort()).toEqual(["obs-2026-10-18.jsonl", "obs-2026-10-19.jsonl"]);
  });
});
