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

/**
 * One whole round trip: capture a probe, then wait for it to become
 * queryable. Flattened into one union so the retry rule below can be written
 * over outcomes rather than over two nested shapes.
 */
export type AttemptResult =
  | { state: "found"; waitedMs: number; attempts: number }
  | { state: "capture_rejected"; status: number }
  | { state: "query_rejected"; status: number }
  | { state: "unreadable"; because: string }
  | { state: "timed_out"; waitedMs: number; attempts: number };

export interface ProbeRunResult {
  final: AttemptResult;
  attemptsUsed: number;
  /** What each attempt that timed out waited for, kept for the message. */
  timedOut: { waitedMs: number; attempts: number }[];
}

/**
 * Runs the round trip, and sends a fresh probe if the first one times out
 * (#960).
 *
 * On 2026-09-03 this check failed twice, twelve minutes apart, and the probe
 * events were in PostHog the whole time: they took longer than the deadline to
 * become queryable. Measured the following morning, three probes became
 * queryable at 37.6s, 54.2s and 54.8s, so the normal case sits far inside the
 * deadline and that was a transient excursion at PostHog rather than ingestion
 * being broken.
 *
 * ONLY A TIMEOUT IS RETRIED. A rejected query means the API key is wrong; an
 * unreadable answer means the query API changed shape; a refused capture means
 * capture itself is failing. None of those is transient, so a second attempt
 * would spend the whole budget again to be told the same thing, and would
 * report a configuration fault as a slow one.
 *
 * The retry costs nothing on a healthy day, because the first attempt succeeds
 * and the second never runs.
 */
export async function runIngestionProbe(deps: {
  attempt: (attemptNumber: number) => Promise<AttemptResult>;
  maxAttempts: number;
}): Promise<ProbeRunResult> {
  if (!Number.isInteger(deps.maxAttempts) || deps.maxAttempts < 1) {
    throw new Error(
      `runIngestionProbe needs at least one attempt, got ${deps.maxAttempts}. ` +
        "Zero attempts would report an outcome nothing measured.",
    );
  }

  const timedOut: { waitedMs: number; attempts: number }[] = [];
  let final: AttemptResult = { state: "timed_out", waitedMs: 0, attempts: 0 };

  for (let n = 1; n <= deps.maxAttempts; n += 1) {
    final = await deps.attempt(n);

    if (final.state !== "timed_out") {
      return { final, attemptsUsed: n, timedOut };
    }

    timedOut.push({ waitedMs: final.waitedMs, attempts: final.attempts });
  }

  return { final, attemptsUsed: deps.maxAttempts, timedOut };
}

// ── How often the first probe times out ───────────────────────

/**
 * The event that records what one run of the check cost (#961).
 *
 * #960 made a timed-out probe send a second one, which is right for a single
 * slow window at PostHog and is also how a DAILY slow window becomes
 * invisible: the run goes green, and the 35 to 55 second figure the deadline
 * was calibrated from could drift a long way with nothing saying so. An error
 * deliberately classified as expected must still be counted against a RATE,
 * because the code waving it through has no notion of volume, so one benign
 * instance and a systemic slowdown arrive on the same path (L77).
 *
 * Its own name, not a property on PROBE_EVENT: a retried run sends TWO probe
 * captures, so counting retries by filtering those would read one slow run as
 * two runs. One outcome event per RUN is the unit the rate is over.
 *
 * PostHog is the store because it is the only durable one this check already
 * reaches. The alternative considered was job_heartbeats.last_result, which
 * the admin jobs page renders; that table is written by the service-role
 * client from Vercel crons, and this check runs in GitHub Actions with only
 * the anon key, so taking it would have meant a new write route, a new
 * repository secret, and widening a table scoped to Vercel's crons.
 */
export const PROBE_OUTCOME_EVENT = "health_check_probe_outcome";

/**
 * What the run cost, as a capture payload.
 *
 * Every run is recorded, including the one that failed outright. A run where
 * both attempts timed out is the strongest evidence the deadline is wrong, so
 * leaving it out would bias the rate downwards exactly when it matters.
 */
export function outcomeBody(
  config: ProbeConfig,
  run: ProbeRunResult,
  now: Date,
) {
  return {
    api_key: config.projectApiKey,
    event: PROBE_OUTCOME_EVENT,
    distinct_id: "posthog-ingestion-health-check",
    properties: {
      attempts_used: run.attemptsUsed,
      first_attempt_timed_out: run.timedOut.length > 0,
      final_state: run.final.state,
      waited_ms:
        "waitedMs" in run.final
          ? run.final.waitedMs
          : (run.timedOut.at(-1)?.waitedMs ?? null),
    },
    timestamp: now.toISOString(),
  };
}

/**
 * How many runs there were in the window, and how many needed a retry.
 *
 * `refresh` for the same reason the per-probe query has it: PostHog caches an
 * answer against the TEXT of the query, and this text is identical on every
 * run, so without it the first day's answer would be re-read forever.
 */
export function retryRateQueryBody(days: number) {
  return {
    refresh: "force_blocking",
    query: {
      kind: "HogQLQuery",
      query:
        "SELECT count() AS runs, " +
        "countIf(properties.first_attempt_timed_out) AS retried " +
        "FROM events " +
        `WHERE event = '${PROBE_OUTCOME_EVENT}' ` +
        `AND timestamp >= now() - INTERVAL ${Math.trunc(days)} DAY`,
    },
  };
}

export type RetryRateReading =
  | { state: "read"; runs: number; retried: number }
  | { state: "unreadable"; because: string };

/**
 * Reads the two counts.
 *
 * An unreadable answer is its own outcome, never zero. Zero retries out of
 * zero runs and "the query API changed shape" are the same number and
 * completely different situations, and a reader that answers with an empty
 * result when its own accessor fails is indistinguishable from a correct
 * reader of an empty set (L215).
 */
export function readRetryRate(payload: unknown): RetryRateReading {
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
  if (
    !Array.isArray(first) ||
    typeof first[0] !== "number" ||
    typeof first[1] !== "number"
  ) {
    return { state: "unreadable", because: "first row held no pair of counts" };
  }
  return { state: "read", runs: first[0], retried: first[1] };
}

export type RetryRateVerdict = {
  state: "not_enough_history" | "within_limit" | "too_often";
  acceptable: boolean;
  message: string;
};

/**
 * Decides whether the first probe times out too often to still call it a
 * transient slow window.
 *
 * `minimumRuns` guards the SAMPLE, never the fraction. A volume floor applied
 * to the fraction would silence the saturation case, because a proportion
 * cannot tell one bad out of two from every run out of every run (L139), and
 * every run needing a retry is the loudest possible version of this defect.
 *
 * "Not enough history" is its own verdict rather than a pass. This check is
 * new, so for its first week the window genuinely holds too little to say
 * anything, and a window that reports healthy while measuring nothing is
 * exactly the failure being fixed (L98).
 */
export function judgeRetryRate(args: {
  runs: number;
  retried: number;
  minimumRuns: number;
  maxRetriedFraction: number;
}): RetryRateVerdict {
  const { runs, retried, minimumRuns, maxRetriedFraction } = args;

  if (runs < minimumRuns) {
    return {
      state: "not_enough_history",
      acceptable: true,
      message:
        `Only ${runs} recorded run(s) in the window, and ${minimumRuns} are ` +
        "needed before the retry rate says anything. Nothing is being judged " +
        "here yet.",
    };
  }

  if (retried / runs > maxRetriedFraction) {
    return {
      state: "too_often",
      acceptable: false,
      message:
        `The first ingestion probe timed out on ${retried} of ${runs} runs ` +
        `in the window, over the ${Math.round(maxRetriedFraction * 100)}% ` +
        "this tolerates. That is no longer a slow window at PostHog: the " +
        "deadline needs re-measuring against real ingestion latency, not " +
        "retrying. Re-measure with the query cache bypassed before changing " +
        "it.",
    };
  }

  return {
    state: "within_limit",
    acceptable: true,
    message:
      `The first ingestion probe timed out on ${retried} of ${runs} runs in ` +
      "the window.",
  };
}
