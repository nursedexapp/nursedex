/**
 * The pieces of the "did the event actually arrive" check that can be tested
 * without talking to PostHog.
 *
 * The check itself (src/lib/__tests__/posthog-ingestion-health.test.ts) sends a
 * uniquely identified event through the same capture endpoint the app uses and
 * then asks PostHog whether it landed. Everything here is the part that decides
 * what to send, what to ask, and what an answer means, so those decisions have
 * tests instead of only ever running against a live service.
 */

/**
 * Named so it can never be mistaken for real activity, and so a dashboard
 * filtering on product events cannot accidentally count it. A synthetic event
 * that shares a name with a real one turns every metric built on that name
 * into a number partly written by the monitoring.
 */
export const PROBE_EVENT = "health_check_probe";

export type ProbeConfig = {
  projectApiKey: string;
  host: string;
  personalApiKey: string;
  projectId: string;
};

export type ConfigResult =
  | { ok: true; config: ProbeConfig }
  | { ok: false; missing: string[] };

/**
 * Reads the four settings the round trip needs.
 *
 * Returns the MISSING NAMES rather than a bare false, because "this check did
 * not run" and "this check ran and passed" must never look the same to whoever
 * reads the result (L98). The caller fails on this; it does not skip.
 */
export function readProbeConfig(
  env: Record<string, string | undefined>,
): ConfigResult {
  const wanted = {
    projectApiKey: env.NEXT_PUBLIC_POSTHOG_KEY,
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    personalApiKey: env.POSTHOG_PERSONAL_API_KEY,
    projectId: env.POSTHOG_PROJECT_ID,
  };
  const missing = Object.entries(wanted)
    .filter(([, value]) => !value)
    .map(([name]) => ENV_NAMES[name as keyof typeof wanted]);

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, config: wanted as ProbeConfig };
}

const ENV_NAMES = {
  projectApiKey: "NEXT_PUBLIC_POSTHOG_KEY",
  host: "NEXT_PUBLIC_POSTHOG_HOST",
  personalApiKey: "POSTHOG_PERSONAL_API_KEY",
  projectId: "POSTHOG_PROJECT_ID",
} as const;

/** A probe id unique per run, so one run can never be satisfied by another's event. */
export function newProbeId(now: Date, random: () => number): string {
  const suffix = Math.floor(random() * 1e9).toString(36);
  return `probe-${now.toISOString()}-${suffix}`;
}

export function captureUrl(host: string): string {
  return `${host.replace(/\/$/, "")}/i/v0/e/`;
}

export function captureBody(config: ProbeConfig, probeId: string, now: Date) {
  return {
    api_key: config.projectApiKey,
    event: PROBE_EVENT,
    distinct_id: "posthog-ingestion-health-check",
    properties: { probe_id: probeId },
    timestamp: now.toISOString(),
  };
}

export function queryUrl(config: ProbeConfig): string {
  return `${config.host.replace(/\/$/, "")}/api/projects/${config.projectId}/query/`;
}

/**
 * Asks only whether THIS probe landed. Bounded to a short window so the query
 * stays cheap and cannot be satisfied by a probe from an earlier run whose id
 * somehow repeated.
 *
 * `refresh` is what makes the polling real. PostHog caches an answer against
 * the TEXT of the query, and every poll here sends the same text, so without
 * this the first attempt's answer is returned to all the rest. That attempt
 * runs a fraction of a second after the capture, when zero is the honest
 * answer, and the check then spends its whole deadline re-reading it (measured
 * 3 September 2026: 52 requests over 182s, all served a zero computed 179ms
 * after the event was sent, while the event was in PostHog throughout).
 */
export function queryBody(probeId: string) {
  return {
    refresh: "force_blocking",
    query: {
      kind: "HogQLQuery",
      query:
        "SELECT count() AS found FROM events " +
        `WHERE event = '${PROBE_EVENT}' ` +
        "AND timestamp >= now() - INTERVAL 1 HOUR " +
        `AND properties.probe_id = '${probeId}'`,
    },
  };
}

/**
 * Reads the query answer.
 *
 * A malformed response is NOT "not found yet": that would let a broken query
 * API look like a slow one and time out with the wrong diagnosis, so it is its
 * own outcome.
 */
export type ProbeAnswer =
  | { state: "found" }
  | { state: "not_yet" }
  | { state: "unreadable"; because: string };

export function interpretQueryResult(payload: unknown): ProbeAnswer {
  if (!payload || typeof payload !== "object") {
    return { state: "unreadable", because: "response was not an object" };
  }
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return { state: "unreadable", because: "response had no results array" };
  }
  if (results.length === 0) {
    return { state: "unreadable", because: "results array was empty" };
  }
  const first = results[0];
  if (!Array.isArray(first) || typeof first[0] !== "number") {
    return { state: "unreadable", because: "first row held no count" };
  }
  return first[0] > 0 ? { state: "found" } : { state: "not_yet" };
}

export type PollOutcome =
  | { state: "found"; waitedMs: number; attempts: number }
  | { state: "query_rejected"; status: number }
  | { state: "unreadable"; because: string }
  | { state: "timed_out"; waitedMs: number; attempts: number };

/**
 * Waits for the probe to appear, or reports precisely why it did not.
 *
 * The clock, the sleep and the query all arrive as arguments. That is not
 * ceremony: without them this loop could only ever be exercised by waiting on a
 * live service for real, so its deadline and its three failure branches would
 * ship unverified, and a loop that never terminates or misreads an answer is
 * exactly the kind of defect a live check cannot surface (it just looks slow).
 *
 * Every outcome is distinct. Folding "I could not read the answer" into "not
 * there yet" would let a broken query API spend the whole deadline and then be
 * reported as broken ingestion.
 */
export async function pollForProbe(deps: {
  runQuery: () => Promise<{ ok: boolean; status: number; body: unknown }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  deadlineMs: number;
  pollEveryMs: number;
}): Promise<PollOutcome> {
  const started = deps.now();
  let attempts = 0;

  while (deps.now() - started < deps.deadlineMs) {
    attempts += 1;
    const res = await deps.runQuery();
    if (!res.ok) return { state: "query_rejected", status: res.status };

    const answer = interpretQueryResult(res.body);
    if (answer.state === "found") {
      return { state: "found", waitedMs: deps.now() - started, attempts };
    }
    if (answer.state === "unreadable") {
      return { state: "unreadable", because: answer.because };
    }
    await deps.sleep(deps.pollEveryMs);
  }

  return { state: "timed_out", waitedMs: deps.now() - started, attempts };
}
