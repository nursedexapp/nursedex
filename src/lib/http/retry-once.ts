// One retry for a refusal that asking again can fix.
//
// Sentry's API gateway (NURSEDEX-SITE-H, 2026-10-19) and GitHub's (a 500 on
// the merged tree proof lookup, 2026-10-13) have each refused a single request
// for no reason the caller could see, and the very next request succeeded.
// One retry absorbs that blip. A second refusal is returned, so a real outage
// still fails on its first run rather than being retried into a timeout.

/** Busy or broken on the server's side: the same request may succeed again. */
export const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500;

const DEFAULT_RETRY_DELAY_MS = 2_000;
// Small enough to fit a 60 second serverless budget with room to spare.
const MAX_RETRY_DELAY_MS = 10_000;

/** The wait before the retry: the server's Retry-After, capped, or 2 seconds. */
export function retryDelayMs(retryAfter: string | null): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

export function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RetryOnceOptions = {
  /** Injected so tests never wait for real (L524). */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Called with the refused response before the retry. Callers count it here:
   * a retry that is only absorbed hides blips growing common (L77).
   */
  onRetry?: (refused: Response) => void;
  /** False when the caller's own retry budget is already spent. */
  mayRetry?: () => boolean;
};

export type RetryingOnceRule<T> = {
  /** Whether asking again could change this result. */
  isRetryable: (result: T) => boolean;
  /** The wait before the retry, which only the caller can size. */
  delayMs: (refused: T) => number;
  /** Injected so tests never wait for real (L524). */
  sleep?: (ms: number) => Promise<void>;
  /** Called with the refused result before the wait. Callers count it here (L77). */
  onRetry?: (refused: T) => void | Promise<void>;
  /** False when the caller's own retry budget is already spent. */
  mayRetry?: () => boolean;
};

/**
 * The rule itself, for any result: calls `attempt`, and once more if the
 * caller says the first result was a refusal asking again can fix. Returns
 * whichever result came last. `fetchRetryingOnce` is this for a `Response`;
 * a client that answers `{ data, error }`, as supabase-js does, uses it
 * directly.
 */
export async function retryingOnce<T>(
  attempt: () => Promise<T>,
  rule: RetryingOnceRule<T>,
): Promise<T> {
  const { sleep = realSleep, mayRetry = () => true } = rule;
  const first = await attempt();
  if (!rule.isRetryable(first) || !mayRetry()) return first;
  await rule.onRetry?.(first);
  await sleep(rule.delayMs(first));
  return attempt();
}

/**
 * Calls `doFetch`, and once more if the answer was a 429 or 5xx. Returns
 * whichever answer came last; deciding what a refusal means stays with the
 * caller.
 */
export async function fetchRetryingOnce(
  doFetch: () => Promise<Response>,
  options: RetryOnceOptions = {},
): Promise<Response> {
  const { sleep, onRetry, mayRetry } = options;
  return retryingOnce(doFetch, {
    isRetryable: (res) => isRetryableStatus(res.status),
    delayMs: (res) => retryDelayMs(res.headers.get("retry-after")),
    sleep,
    mayRetry,
    onRetry: async (refused) => {
      onRetry?.(refused);
      // An unread body holds its connection until garbage collection.
      await refused.body?.cancel().catch(() => {});
    },
  });
}
