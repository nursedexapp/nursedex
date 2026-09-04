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

describe("PostHog ingestion", () => {
  it("records an event sent through the app's own capture endpoint", async () => {
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
  }, DEADLINE_MS * MAX_ATTEMPTS + 60_000);
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
        .map((t) => `${Math.round(t.waitedMs / 1000)}s over ${t.attempts} polls`)
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
