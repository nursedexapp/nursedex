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
  { ok: true; config: ProbeConfig } | { ok: false; missing: string[] };

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

/**
 * How long one probe was waited for, and how many of the polls in that wait
 * PostHog could not answer at all (a 429 or a 5xx).
 */
type Waited = {
  waitedMs: number;
  attempts: number;
  unavailableAnswers: number;
};

/**
 * A refused read back, sorted by what the status means rather than lumped
 * together.
 *
 * Until 2026-10-14 every non-ok status was "query_rejected", explained as a
 * wrong API key. That day the query service answered one HTTP 503, the check
 * failed at once blaming the key, and a rerun minutes later passed with the
 * same key. Only 401 and 403 are about the key. A 429 or a 5xx is PostHog not
 * answering right now, which is waited out inside the deadline like a slow
 * answer. Anything else is a query PostHog would not run, and saying it is the
 * key would send whoever reads the alert to rotate a key that works.
 */
export type QueryRefusal = "query_rejected" | "query_refused" | "transient";

export function classifyQueryRefusal(status: number): QueryRefusal {
  if (status === 401 || status === 403) return "query_rejected";
  if (status === 429 || status >= 500) return "transient";
  return "query_refused";
}

export type PollOutcome =
  | ({ state: "found" } & Waited)
  | { state: "query_rejected"; status: number }
  | { state: "query_refused"; status: number }
  | ({ state: "query_unavailable"; status: number } & Waited)
  | ({ state: "query_throttled"; status: number } & Waited)
  | { state: "unreadable"; because: string }
  | ({ state: "timed_out" } & Waited);

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
  let unavailableAnswers = 0;
  // The status of the most recent poll, if PostHog could not answer it. Read
  // at the deadline: only when the LAST answer was a refusal is the absence
  // about the query service rather than ingestion.
  let lastUnavailable: number | null = null;
  const waited = () => ({
    waitedMs: deps.now() - started,
    attempts,
    unavailableAnswers,
  });

  while (deps.now() - started < deps.deadlineMs) {
    attempts += 1;
    const res = await deps.runQuery();
    if (!res.ok) {
      const refusal = classifyQueryRefusal(res.status);
      if (refusal !== "transient")
        return { state: refusal, status: res.status };
      unavailableAnswers += 1;
      lastUnavailable = res.status;
      await deps.sleep(deps.pollEveryMs);
      continue;
    }
    lastUnavailable = null;

    const answer = interpretQueryResult(res.body);
    if (answer.state === "found") {
      return { state: "found", ...waited() };
    }
    if (answer.state === "unreadable") {
      return { state: "unreadable", because: answer.because };
    }
    await deps.sleep(deps.pollEveryMs);
  }

  if (lastUnavailable !== null) {
    return {
      state: lastUnavailable === 429 ? "query_throttled" : "query_unavailable",
      status: lastUnavailable,
      ...waited(),
    };
  }
  return { state: "timed_out", ...waited() };
}

/**
 * One whole round trip: capture a probe, then wait for it to become
 * queryable. Flattened into one union so the retry rule below can be written
 * over outcomes rather than over two nested shapes.
 */
export type AttemptResult =
  PollOutcome | { state: "capture_rejected"; status: number };

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
 * ONLY A TIMEOUT IS RETRIED. A rejected query means the API key is wrong; a
 * refused one means PostHog will not run the query as written; an unreadable
 * answer means the query API changed shape; a refused capture means capture
 * itself is failing. None of those is transient, so a second attempt would
 * spend the whole budget again to be told the same thing, and would report a
 * configuration fault as a slow one. A query service that stayed unavailable
 * or throttled was already waited on for a whole deadline, and a fresh probe
 * would be read back through the same service.
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
  let final: AttemptResult = {
    state: "timed_out",
    waitedMs: 0,
    attempts: 0,
    unavailableAnswers: 0,
  };

  for (let n = 1; n <= deps.maxAttempts; n += 1) {
    final = await deps.attempt(n);

    if (final.state !== "timed_out") {
      return { final, attemptsUsed: n, timedOut };
    }

    timedOut.push({ waitedMs: final.waitedMs, attempts: final.attempts });
  }

  return { final, attemptsUsed: deps.maxAttempts, timedOut };
}

// ── What a run's outcome means ─────────────────────────────────

/**
 * One sentence per cause. These are different problems with different
 * remedies, and a single "ingestion check failed" would send whoever reads it
 * looking in the wrong place. Each sentence claims only what its branch
 * measured (L11): on 2026-10-14 an HTTP 503 was explained as a wrong API key.
 */
export function explainRun(run: ProbeRunResult): string {
  const outcome = run.final;

  switch (outcome.state) {
    case "found":
      return "";
    case "capture_rejected":
      return (
        `PostHog refused the probe event with HTTP ${outcome.status}. Capture ` +
        "itself is failing, so nothing the app sends is being recorded."
      );
    case "query_rejected":
      return (
        `PostHog refused the read back with HTTP ${outcome.status}, which is an ` +
        "authorisation refusal: the personal API key is wrong, revoked, or lacks " +
        "query access, so this check cannot tell whether ingestion works either way."
      );
    case "query_refused":
      return (
        `PostHog would not run the read back query and answered HTTP ` +
        `${outcome.status}. That is not an authorisation refusal, so the query ` +
        "itself or the endpoint it is sent to needs looking at. This check cannot " +
        "tell whether ingestion works until it does."
      );
    case "query_unavailable":
      return (
        `PostHog's query service was unavailable for the whole ` +
        `${Math.round(outcome.waitedMs / 1000)}s wait (${outcome.unavailableAnswers} ` +
        `of ${outcome.attempts} polls answered HTTP 5xx, the last HTTP ` +
        `${outcome.status}). That is an outage on PostHog's side, not a fault in ` +
        "our setup, and this check cannot tell whether ingestion works until it ends."
      );
    case "query_throttled":
      return (
        `PostHog throttled the read back for the whole ` +
        `${Math.round(outcome.waitedMs / 1000)}s wait (${outcome.unavailableAnswers} ` +
        `of ${outcome.attempts} polls answered HTTP 429). The check is asking ` +
        "more often than PostHog allows, so it cannot tell whether ingestion works."
      );
    case "unreadable":
      return (
        `PostHog answered in a shape this check does not understand ` +
        `(${outcome.because}). That is not the same as the event being absent, ` +
        "and it needs looking at rather than retrying."
      );
    case "timed_out": {
      // Naming every attempt matters: two long waits are a different story
      // from one, and the difference is what separates a slow window from
      // ingestion actually being down.
      const waits = run.timedOut
        .map(
          (t) => `${Math.round(t.waitedMs / 1000)}s over ${t.attempts} polls`,
        )
        .join(", then ");
      // Polls PostHog could not answer are not evidence of absence, so a wait
      // partly spent on them is said to be.
      const down =
        outcome.unavailableAnswers > 0
          ? ` PostHog could not answer ${outcome.unavailableAnswers} of ` +
            `${outcome.attempts} polls in the last wait, so part of it measured ` +
            "nothing."
          : "";
      return (
        `${run.attemptsUsed} separate ${PROBE_EVENT} events were accepted by ` +
        `PostHog and neither appeared in queries (${waits}). Capture is ` +
        "answering while ingestion is not recording, which is the failure this " +
        "check exists to catch: recorded events would quietly fall to zero and " +
        "look like a drop in traffic. Measured on 4 September 2026, a healthy " +
        `probe becomes queryable in 35 to 55 seconds.${down}`
      );
    }
  }
}

/**
 * A pass that needed PostHog's query service to come back must not pass in
 * silence (L77): a service that is down a little every day would otherwise be
 * invisible behind green runs. The count is also recorded on the outcome
 * event, so it can become a rate.
 */
export function recoveryNote(
  found: Extract<PollOutcome, { state: "found" }>,
): string | null {
  if (found.unavailableAnswers === 0) return null;
  return (
    `[posthog-ingestion] PostHog could not answer ${found.unavailableAnswers} ` +
    `of ${found.attempts} polls (HTTP 429 or 5xx) before the probe was found. ` +
    "Waited out, so this run passed. Several days of this in a row is PostHog " +
    "being unreliable for us, not a slow window."
  );
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
      unavailable_answers:
        "unavailableAnswers" in run.final ? run.final.unavailableAnswers : 0,
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
