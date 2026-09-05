import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import path from "path";
import {
  readProbeConfig,
  newProbeId,
  captureUrl,
  captureBody,
  queryUrl,
  queryBody,
  pollForProbe,
  runIngestionProbe,
  type AttemptResult,
  type ProbeRunResult,
  PROBE_EVENT,
  outcomeBody,
  retryRateQueryBody,
  readRetryRate,
  judgeRetryRate,
} from "@/lib/analytics/ingestion-probe";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

/**
 * Are the events this app sends actually being RECORDED?
 *
 * The neighbouring posthog-health check proves PostHog answers for this project
 * key. That is not the same question. A project can answer happily while
 * ingestion is dropping everything, and analytics going quiet is close to
 * undetectable from outside: a fall in recorded events looks exactly like a
 * fall in traffic.
 *
 * So this sends a uniquely identified event through the same capture endpoint
 * the app uses, then asks PostHog whether that exact event landed. It is the
 * only check here that measures the pipeline rather than the configuration.
 *
 * It waits on the CONDITION with a deadline rather than sleeping a fixed
 * guess, so it finishes as soon as the event lands and still fails rather than
 * hanging if it never does.
 *
 * The probe event is named `health_check_probe` and appears in no product
 * metric, so this monitoring cannot write itself into a number anybody reads.
 */

/**
 * Measured, and the first two calibrations were both wrong. The samples are
 * kept rather than summarised, because each correction came from having them.
 *
 * A probe sent by hand on 2 September 2026 read as absent seconds after
 * capture and present about 90 seconds later, and that 90 seconds was written
 * here as the ingestion lag. It was not. Those reads went through PostHog's
 * query cache, so what they timed was the cached answer expiring, not the
 * event arriving. Anything measured through a repeated identical query
 * measures the cache (see queryBody's `refresh`).
 *
 * Re-measured on 3 September 2026 with the cache bypassed, one probe was
 * absent at 31s and present at 35s. That single sample became a 180s deadline
 * described as "generous by roughly five times".
 *
 * It was not that either. On 3 September the check timed out at 182s twice,
 * twelve minutes apart, and the workflow stayed failed for 43 hours until the
 * job watchdog said so. The probe events were in PostHog the whole time, with
 * their original timestamps: they had been ingested and simply took longer
 * than 182s to become queryable.
 *
 * Measured again on 4 September 2026, cache bypassed, three probes:
 *
 *   37.6s, 54.2s, 54.8s
 *
 * So the real range on a normal day is roughly 35 to 55 seconds, and the old
 * margin was about three times rather than five. Six minutes is roughly six
 * times the slowest of those, and past the excursion that actually happened.
 *
 * The deadline is only half the answer, because no single number can be proof
 * against a service whose latency is not ours to control. A timeout now sends
 * a SECOND probe before failing, so one slow window costs a retry rather than
 * a red workflow and a 43 hour gap. Both attempts have to time out for this to
 * fail, which makes a genuine ingestion outage the only thing that can fail
 * it.
 *
 * The retry is free on a healthy day: the first attempt lands in under a
 * minute and the second never runs. The worst case is two full deadlines, and
 * the workflow's own timeout is set from that arithmetic rather than guessed.
 *
 * Re-measure with the cache bypassed before shortening either number.
 */
const DEADLINE_MS = 360_000;
const POLL_EVERY_MS = 3_000;
const MAX_ATTEMPTS = 2;

/**
 * How often the first probe may time out before the deadline itself is the
 * problem rather than PostHog having a slow afternoon (#961).
 *
 * A NUMBER NOBODY HAS MEASURED YET, deliberately, and stated as such: this
 * check has never recorded its own outcomes, so there is no distribution to
 * calibrate against. What is known is the shape of the healthy case, 35 to 55
 * seconds against a 360 second deadline, so a first attempt timing out on more
 * than a third of days is not a slow window any more.
 *
 * Re-measure it once the window has real history, which is #887.
 *
 * The floor guards the SAMPLE, never the fraction. Fourteen days of a daily
 * job is a full window; seven is the least that says anything, which is a week
 * after this ships. Below that the verdict is "not enough history yet", said
 * out loud, rather than a pass.
 */
const RETRY_RATE_WINDOW_DAYS = 14;
const RETRY_RATE_MINIMUM_RUNS = 7;
const RETRY_RATE_MAX_FRACTION = 1 / 3;

describe("PostHog ingestion", () => {
  it(
    "records an event sent through the app's own capture endpoint",
    async () => {
      const configured = readProbeConfig(process.env);

      // Deliberately a FAILURE, never a skip. A check that quietly stands down
      // when it is not configured reports healthy while measuring nothing, which
      // is worse than not having the check at all.
      expect(
        configured.ok,
        configured.ok
          ? ""
          : `Cannot verify PostHog ingestion: ${(configured as { missing: string[] }).missing.join(", ")} ` +
              "is not set. Create a personal API key in PostHog (Settings, personal " +
              "API keys) with query read access, then set it and POSTHOG_PROJECT_ID " +
              "in .env.local and as repository secrets. Until then nothing is " +
              "checking that events are being recorded at all.",
      ).toBe(true);
      if (!configured.ok) return;

      const { config } = configured;

      /** One whole round trip: send a uniquely identified probe, wait for it. */
      async function attemptOnce(): Promise<AttemptResult> {
        const probeId = newProbeId(new Date(), Math.random);

        const sent = await fetch(captureUrl(config.host), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(captureBody(config, probeId, new Date())),
        });
        if (!sent.ok) {
          return { state: "capture_rejected", status: sent.status };
        }

        // The loop itself lives in ingestion-probe.ts behind an injected clock
        // and sleep, so its deadline and its three failure branches are tested
        // there instantly rather than only ever exercised against a live
        // service.
        return await pollForProbe({
          runQuery: async () => {
            const res = await fetch(queryUrl(config), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.personalApiKey}`,
              },
              body: JSON.stringify(queryBody(probeId)),
            });
            return {
              ok: res.ok,
              status: res.status,
              body: res.ok ? await res.json() : null,
            };
          },
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          deadlineMs: DEADLINE_MS,
          pollEveryMs: POLL_EVERY_MS,
        });
      }

      // A fresh probe on a timeout, and only on a timeout. The retry rule and
      // every outcome it does NOT retry are tested in ingestion-probe.test.ts.
      const run = await runIngestionProbe({
        attempt: attemptOnce,
        maxAttempts: MAX_ATTEMPTS,
      });

      expect(run.final.state, explain(run)).toBe("found");

      // A retry that succeeded must not pass in silence (L77). The check going
      // green is the right outcome for one slow window, but a window that is
      // slow EVERY day would then be invisible: the run would pass forever while
      // the latency this deadline was set from crept up underneath it. So a used
      // retry is said out loud, in the run log, with what it waited.
      //
      // This is a line in the log rather than a counted rate, which is the
      // weaker half of L77 and is tracked in #961. It is enough to make a
      // recurring retry visible to anybody reading a green run.
      for (const [index, timedOut] of run.timedOut.entries()) {
        console.warn(
          `[posthog-ingestion] probe ${index + 1} of ${MAX_ATTEMPTS} timed out ` +
            `after ${Math.round(timedOut.waitedMs / 1000)}s and ` +
            `${timedOut.attempts} polls, so another was sent. A healthy probe ` +
            "becomes queryable in 35 to 55 seconds (measured 4 September 2026). " +
            "One of these is a slow window at PostHog. Several in a row means " +
            "the deadline needs re-measuring, not retrying.",
        );
      }

      // What this run cost, recorded before the assertion below, so a run that
      // FAILS is counted too. A rate assembled only from runs that got as far as
      // passing would be biased downwards exactly when it matters (L540).
      const recorded = await fetch(captureUrl(config.host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outcomeBody(config, run, new Date())),
      });
      if (!recorded.ok) {
        // Not a failure of ingestion, and not silent either: the rate below is
        // computed from these, so one that stopped being written would make the
        // window look quieter and quieter with nothing saying why.
        console.warn(
          `[posthog-ingestion] this run's outcome was not recorded (HTTP ` +
            `${recorded.status}), so it is missing from the retry rate.`,
        );
      }

      // A retry that succeeded must not pass in silence (L77). The check going
      // green is the right outcome for one slow window, but a window that is
      // slow EVERY day would otherwise be invisible: the run would pass forever
      // while the latency this deadline was set from crept up underneath it. The
      // log line below says it happened; this is what makes it countable.
      const rateAnswer = await fetch(queryUrl(config), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.personalApiKey}`,
        },
        body: JSON.stringify(retryRateQueryBody(RETRY_RATE_WINDOW_DAYS)),
      });
      const reading = rateAnswer.ok
        ? readRetryRate(await rateAnswer.json())
        : ({
            state: "unreadable",
            because: `HTTP ${rateAnswer.status}`,
          } as const);

      // An unreadable rate is reported, never treated as zero: a reader that
      // answers empty when its own accessor fails is indistinguishable from a
      // correct reader of an empty set (L215). It does not fail the check,
      // because the round trip asserted above is the thing this check is named
      // for and a broken history query says nothing about it.
      if (reading.state === "unreadable") {
        console.warn(
          `[posthog-ingestion] could not read how often the first probe times ` +
            `out (${reading.because}), so that rate is unjudged today.`,
        );
      } else {
        const verdict = judgeRetryRate({
          runs: reading.runs,
          retried: reading.retried,
          minimumRuns: RETRY_RATE_MINIMUM_RUNS,
          maxRetriedFraction: RETRY_RATE_MAX_FRACTION,
        });
        // Said on every outcome, including the healthy one, so a green run
        // carries the number rather than only the runs that fail.
        console.log(`[posthog-ingestion] ${verdict.message}`);
        expect(verdict.acceptable, verdict.message).toBe(true);
      }
    },
    DEADLINE_MS * MAX_ATTEMPTS + 60_000,
  );
});

/**
 * One sentence per cause. These are five different problems with five
 * different remedies, and a single "ingestion check failed" would send whoever
 * reads it looking in the wrong place.
 */
function explain(run: ProbeRunResult): string {
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
        `PostHog rejected the read back with HTTP ${outcome.status}. The personal ` +
        "API key is probably wrong or lacks query access, so this check cannot " +
        "tell whether ingestion works either way."
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
      return (
        `${run.attemptsUsed} separate ${PROBE_EVENT} events were accepted by ` +
        `PostHog and neither appeared in queries (${waits}). Capture is ` +
        "answering while ingestion is not recording, which is the failure this " +
        "check exists to catch: recorded events would quietly fall to zero and " +
        "look like a drop in traffic. Measured on 4 September 2026, a healthy " +
        "probe becomes queryable in 35 to 55 seconds."
      );
    }
  }
}
