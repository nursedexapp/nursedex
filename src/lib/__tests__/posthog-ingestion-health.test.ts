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
  interpretQueryResult,
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
 * Measured, not guessed. A probe sent by hand on 2 September 2026 was ABSENT
 * from queries a few seconds after capture returned 200, and present about 90
 * seconds later. So PostHog's ingestion lag here is under two minutes but well
 * over a few seconds, and a deadline near the observed lag would fail on a
 * healthy pipeline. Three minutes leaves real headroom and still sits far
 * inside the workflow's ten minute timeout.
 *
 * Re-measure this before shortening it. The check finishes as soon as the event
 * lands, so a generous deadline costs nothing on a good day and is only ever
 * paid on a genuinely broken one.
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

    const started = Date.now();
    let attempts = 0;
    let lastAnswer = "never queried";

    while (Date.now() - started < DEADLINE_MS) {
      attempts += 1;
      const res = await fetch(queryUrl(config), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.personalApiKey}`,
        },
        body: JSON.stringify(queryBody(probeId)),
      });

      if (!res.ok) {
        // A rejected query is its own fault, not slow ingestion, so say so now
        // rather than spending the whole deadline and blaming the pipeline.
        expect(
          res.ok,
          `PostHog rejected the read back with HTTP ${res.status}. The personal ` +
            "API key is probably wrong or lacks query access, so this check " +
            "cannot tell whether ingestion works.",
        ).toBe(true);
        return;
      }

      const answer = interpretQueryResult(await res.json());
      if (answer.state === "found") {
        expect(answer.state).toBe("found");
        return;
      }
      if (answer.state === "unreadable") {
        expect(
          answer.state,
          `PostHog answered in a shape this check does not understand ` +
            `(${answer.because}). That is not the same as the event being ` +
            "absent, and it needs looking at rather than retrying.",
        ).toBe("found");
        return;
      }

      lastAnswer = "not yet recorded";
      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
    }

    const waited = Math.round((Date.now() - started) / 1000);
    expect(
      lastAnswer,
      `A ${PROBE_EVENT} event was accepted by PostHog but never appeared in ` +
        `queries after ${waited}s and ${attempts} attempts. Capture is ` +
        "answering while ingestion is not recording, which is the failure this " +
        "check exists to catch: recorded events would quietly fall to zero and " +
        "look like a drop in traffic.",
    ).toBe("found");
  }, DEADLINE_MS + 30_000);
});
