export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly retryAfterMs?: number,
  ) {
    super(`Request failed (${status}): ${url}`);
    this.name = "HttpError";
  }
}

export interface RequestOptions {
  /** Retries after the first attempt (default 3). */
  retries?: number;
  /** First backoff delay; doubles per retry with full jitter (default 500 ms). */
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  /** Injected in tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Parses Retry-After as delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function backoffDelayMs(attempt: number, options: RequestOptions, error?: unknown): number {
  const base = options.baseDelayMs ?? 500;
  const cap = options.maxDelayMs ?? 8000;
  const random = options.random ?? Math.random;
  const exponential = Math.min(cap, base * 2 ** attempt);
  const jittered = Math.round(exponential * (0.5 + random() / 2));
  const retryAfter = error instanceof HttpError ? error.retryAfterMs : undefined;
  return retryAfter === undefined ? jittered : Math.min(cap, Math.max(jittered, retryAfter));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return RETRYABLE_STATUS.has(error.status);
  // Timeouts, DNS failures and connection resets surface as AbortError/TypeError from fetch.
  return error instanceof Error && !(error instanceof SyntaxError);
}

async function requestOnce<T>(url: string, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "prediction-market-research-lab/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new HttpError(response.status, url, parseRetryAfter(response.headers.get("retry-after")));
  }
  return (await response.json()) as T;
}

/**
 * GET JSON with a per-attempt timeout and bounded retries. Transient failures
 * (network errors, 408/425/429/5xx) are retried with jittered exponential backoff
 * that honors Retry-After. Other 4xx responses and malformed JSON fail immediately.
 */
export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 15000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce<T>(url, timeoutMs);
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      await sleep(backoffDelayMs(attempt, options, error));
    }
  }
}
