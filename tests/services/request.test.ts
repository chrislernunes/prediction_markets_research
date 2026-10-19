import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { HttpError, backoffDelayMs, parseRetryAfter, requestJson } from "../../src/services/market-data/request";

const noSleep = async () => {};
let fetchSpy: ReturnType<typeof spyOn> | null = null;
afterEach(() => fetchSpy?.mockRestore());

function mockFetch(responses: Array<Response | Error>) {
  let call = 0;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
    const next = responses[Math.min(call++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof globalThis.fetch);
  return () => call;
}

describe("requestJson", () => {
  test("returns JSON without retrying on success", async () => {
    const calls = mockFetch([Response.json({ ok: 1 })]);
    expect(await requestJson<{ ok: number }>("https://x.test/a", { sleep: noSleep })).toEqual({ ok: 1 });
    expect(calls()).toBe(1);
  });

  test("retries 429 and 5xx, then succeeds", async () => {
    const calls = mockFetch([new Response("slow down", { status: 429 }), new Response("boom", { status: 503 }), Response.json({ ok: 2 })]);
    const delays: number[] = [];
    const result = await requestJson<{ ok: number }>("https://x.test/b", { sleep: async (ms) => void delays.push(ms), random: () => 0 });
    expect(result).toEqual({ ok: 2 });
    expect(calls()).toBe(3);
    expect(delays).toEqual([250, 500]);
  });

  test("retries network errors", async () => {
    const calls = mockFetch([new TypeError("fetch failed"), Response.json({ ok: 3 })]);
    expect(await requestJson<{ ok: number }>("https://x.test/c", { sleep: noSleep })).toEqual({ ok: 3 });
    expect(calls()).toBe(2);
  });

  test("does not retry other 4xx", async () => {
    const calls = mockFetch([new Response("nope", { status: 404 })]);
    await expect(requestJson("https://x.test/d", { sleep: noSleep })).rejects.toBeInstanceOf(HttpError);
    expect(calls()).toBe(1);
  });

  test("gives up after the retry budget and surfaces the last error", async () => {
    const calls = mockFetch([new Response("bad", { status: 500 })]);
    await expect(requestJson("https://x.test/e", { retries: 2, sleep: noSleep })).rejects.toMatchObject({ status: 500 });
    expect(calls()).toBe(3);
  });

  test("does not retry malformed JSON", async () => {
    const calls = mockFetch([new Response("not json", { status: 200 })]);
    await expect(requestJson("https://x.test/f", { sleep: noSleep })).rejects.toBeInstanceOf(SyntaxError);
    expect(calls()).toBe(1);
  });
});

describe("backoff", () => {
  test("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("garbage")).toBeUndefined();
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
  });

  test("honors Retry-After above the jittered delay but never beyond the cap", () => {
    const error = new HttpError(429, "u", 5000);
    expect(backoffDelayMs(0, { random: () => 0 }, error)).toBe(5000);
    expect(backoffDelayMs(0, { random: () => 0, maxDelayMs: 2000 }, error)).toBe(2000);
    expect(backoffDelayMs(10, { random: () => 1, maxDelayMs: 8000 })).toBe(8000);
  });
});
