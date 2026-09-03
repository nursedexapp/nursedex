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
  type PollOutcome,
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
 * Measured, and the first measurement was wrong in a way worth recording.
 *
 * A probe sent by hand on 2 September 2026 read as absent seconds after capture
 * and present about 90 seconds later, and that 90 seconds was written here as
 * the ingestion lag. It was not. Those reads went through PostHog's query
 * cache, so what they timed was the cached answer expiring, not the event
 * arriving. Anything measured through a repeated identical query measures the
 * cache (see queryBody's `refresh`).
 *
 * Re-measured on 3 September 2026 with the cache bypassed, one probe was absent
 * at 31s and present at 35s. That is one sample from one machine, not a
 * distribution, so it is a floor to stay well clear of rather than a number to
 * calibrate against.
 *
 * Three minutes is therefore generous by roughly five times, deliberately, and
 * still sits far inside the workflow's ten minute timeout. The check finishes
 * as soon as the event lands, so the headroom costs nothing on a good day and
 * is only ever paid on a genuinely broken one. Re-measure before shortening it,
 * with the cache bypassed.
 */
const DEADLINE_MS = 180_000;
const POLL_EVERY_MS = 3_000;

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
    const probeId = newProbeId(new Date(), Math.random);

    const sent = await fetch(captureUrl(config.host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(captureBody(config, probeId, new Date())),
    });
    expect(
      sent.ok,
      `PostHog refused the probe event with HTTP ${sent.status}. Capture itself ` +
        "is failing, so nothing the app sends is being recorded.",
    ).toBe(true);

    // The loop itself lives in ingestion-probe.ts behind an injected clock and
    // sleep, so its deadline and its three failure branches are tested there
    // instantly rather than only ever exercised against a live service.
    const outcome = await pollForProbe({
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

    expect(outcome.state, explain(outcome)).toBe("found");
  }, DEADLINE_MS + 30_000);
});

/**
 * One sentence per cause. These are four different problems with four different
 * remedies, and a single "ingestion check failed" would send whoever reads it
 * looking in the wrong place.
 */
function explain(outcome: PollOutcome): string {
  switch (outcome.state) {
    case "found":
      return "";
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
    case "timed_out":
      return (
        `A ${PROBE_EVENT} event was accepted by PostHog but never appeared in ` +
        `queries after ${Math.round(outcome.waitedMs / 1000)}s and ` +
        `${outcome.attempts} attempts. Capture is answering while ingestion is ` +
        "not recording, which is the failure this check exists to catch: " +
        "recorded events would quietly fall to zero and look like a drop in " +
        "traffic."
      );
  }
}
