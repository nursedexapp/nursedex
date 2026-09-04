// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PROBE_EVENT,
  readProbeConfig,
  newProbeId,
  captureUrl,
  captureBody,
  queryUrl,
  queryBody,
  interpretQueryResult,
  pollForProbe,
  runIngestionProbe,
  type AttemptResult,
} from "./ingestion-probe";

/**
 * The decisions behind the ingestion round trip, tested without a live service.
 *
 * The outcomes that matter most here are the unhappy ones. A check that cannot
 * tell "the event has not arrived yet" from "I could not read the answer" will
 * eventually time out and blame the wrong thing, and one that treats a missing
 * setting as a reason to skip reports healthy while measuring nothing.
 */

const CONFIGURED = {
  NEXT_PUBLIC_POSTHOG_KEY: "phc_abc",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  POSTHOG_PERSONAL_API_KEY: "phx_secret",
  POSTHOG_PROJECT_ID: "358871",
};

describe("readProbeConfig", () => {
  it("accepts a fully configured environment", () => {
    const result = readProbeConfig(CONFIGURED);
    expect(result.ok).toBe(true);
  });

  it("names every missing setting rather than reporting a bare failure", () => {
    const result = readProbeConfig({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_abc",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    });

    expect(result).toEqual({
      ok: false,
      missing: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"],
    });
  });

  it("treats an empty string as missing, not as a value", () => {
    // A templating layer renders an unset secret as empty rather than absent,
    // so a truthiness check is the only one that catches both.
    const result = readProbeConfig({
      ...CONFIGURED,
      POSTHOG_PERSONAL_API_KEY: "",
    });
    expect(result).toEqual({ ok: false, missing: ["POSTHOG_PERSONAL_API_KEY"] });
  });
});

describe("newProbeId", () => {
  it("is unique per run, so one run cannot be satisfied by another's event", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const a = newProbeId(now, () => 0.1);
    const b = newProbeId(now, () => 0.9);
    expect(a).not.toEqual(b);
  });
});

describe("the requests it sends", () => {
  const config = {
    projectApiKey: "phc_abc",
    host: "https://us.i.posthog.com/",
    personalApiKey: "phx_secret",
    projectId: "358871",
  };

  it("captures through the same endpoint shape the app uses, with no double slash", () => {
    expect(captureUrl(config.host)).toBe("https://us.i.posthog.com/i/v0/e/");
  });

  it("sends the probe id as a property so the read back can find this one event", () => {
    const body = captureBody(config, "probe-123", new Date("2026-09-02T12:00:00.000Z"));
    expect(body.event).toBe(PROBE_EVENT);
    expect(body.properties.probe_id).toBe("probe-123");
    expect(body.api_key).toBe("phc_abc");
  });

  it("queries the project by id, not by guessing a path", () => {
    expect(queryUrl(config)).toBe(
      "https://us.i.posthog.com/api/projects/358871/query/",
    );
  });

  /**
   * The defect this exists to stop coming back, measured on 3 September 2026.
   *
   * PostHog caches a query answer against the text of the query, and this poll
   * sends the SAME text every few seconds. The first attempt runs a fraction of
   * a second after the event is sent, when the honest answer is genuinely zero,
   * and every later attempt was handed that cached zero back. The check waited
   * three minutes, made 52 requests, and read its own first answer 52 times
   * while the event sat in PostHog the whole while.
   *
   * A poll that cannot observe a change is not a poll, so the request has to
   * say it wants the answer recomputed.
   */
  it("makes each poll recompute, so it cannot be handed its own first answer", () => {
    expect(queryBody("probe-123").refresh).toBe("force_blocking");
  });

  it("asks only about this probe, inside a bounded window", () => {
    const sql = queryBody("probe-123").query.query;
    expect(sql).toContain("probe-123");
    expect(sql).toContain(PROBE_EVENT);
    expect(sql).toContain("INTERVAL 1 HOUR");
  });
});

describe("interpretQueryResult", () => {
  it("reports found when the count is positive", () => {
    expect(interpretQueryResult({ results: [[1]] })).toEqual({ state: "found" });
  });

  it("reports not yet when the event genuinely has not landed", () => {
    expect(interpretQueryResult({ results: [[0]] })).toEqual({
      state: "not_yet",
    });
  });

  it.each([
    ["a null response", null, "response was not an object"],
    ["a response with no results", { error: "nope" }, "response had no results array"],
    ["an empty results array", { results: [] }, "results array was empty"],
    ["a row holding no count", { results: [["nope"]] }, "first row held no count"],
  ])(
    "does not mistake %s for the event not having arrived",
    (_label, payload, because) => {
      // This is the distinction the whole check rests on. If an unreadable
      // answer counted as "not yet", a broken query API would look like slow
      // ingestion and the check would time out blaming the wrong thing.
      expect(interpretQueryResult(payload)).toEqual({
        state: "unreadable",
        because,
      });
    },
  );
});

describe("pollForProbe", () => {
  /**
   * A fake clock and a fake sleep, so these run instantly and assert the
   * SCHEDULE rather than surviving it. Sleeping for real here would make the
   * deadline case a three minute test, which is how a loop like this ends up
   * with no coverage at all.
   */
  function harness(answers: { ok: boolean; status: number; body: unknown }[]) {
    let clock = 0;
    const slept: number[] = [];
    let served = 0;
    return {
      slept,
      deps: {
        runQuery: async () => answers[Math.min(served++, answers.length - 1)],
        now: () => clock,
        sleep: async (ms: number) => {
          slept.push(ms);
          clock += ms;
        },
        deadlineMs: 30_000,
        pollEveryMs: 3_000,
      },
    };
  }

  const notYet = { ok: true, status: 200, body: { results: [[0]] } };
  const found = { ok: true, status: 200, body: { results: [[1]] } };

  it("stops the moment the event lands, rather than serving out the deadline", async () => {
    const h = harness([notYet, notYet, found]);
    const outcome = await pollForProbe(h.deps);

    expect(outcome).toEqual({ state: "found", waitedMs: 6_000, attempts: 3 });
    // Two waits, not ten: it did not keep polling after it had its answer.
    expect(h.slept).toEqual([3_000, 3_000]);
  });

  it("times out rather than hanging when the event never arrives", async () => {
    const h = harness([notYet]);
    const outcome = await pollForProbe(h.deps);

    expect(outcome.state).toBe("timed_out");
    // A wait with no deadline cannot fail, it can only hang, and a hang is
    // indistinguishable from slowness.
    expect((outcome as { waitedMs: number }).waitedMs).toBeGreaterThanOrEqual(
      30_000,
    );
  });

  it("blames the query, not ingestion, when the query is rejected", async () => {
    const h = harness([{ ok: false, status: 401, body: null }]);
    const outcome = await pollForProbe(h.deps);

    // Immediately, without spending the deadline first: a bad key is not slow
    // ingestion and must not be reported as it.
    expect(outcome).toEqual({ state: "query_rejected", status: 401 });
    expect(h.slept).toEqual([]);
  });

  it("stops on an answer it cannot read, instead of retrying it to death", async () => {
    const h = harness([{ ok: true, status: 200, body: { error: "boom" } }]);
    const outcome = await pollForProbe(h.deps);

    expect(outcome).toEqual({
      state: "unreadable",
      because: "response had no results array",
    });
    expect(h.slept).toEqual([]);
  });
});

/**
 * One slow window at PostHog must not fail the workflow (#960).
 *
 * On 2026-09-03 the probe timed out twice, twelve minutes apart, and the
 * events were in PostHog the whole time: they simply took longer than the
 * deadline to become queryable. Measured on 2026-09-04, three probes became
 * queryable at 37.6s, 54.2s and 54.8s, so the normal case is well inside the
 * deadline and the failure was a transient excursion.
 *
 * A second probe costs nothing on a healthy day, because the first one
 * succeeds and the retry never runs.
 */
describe("runIngestionProbe", () => {
  function attempts(...results: AttemptResult[]) {
    const seen: number[] = [];
    return {
      seen,
      attempt: async (n: number) => {
        seen.push(n);
        return results[n - 1] ?? results[results.length - 1];
      },
    };
  }

  const FOUND: AttemptResult = { state: "found", waitedMs: 40_000, attempts: 14 };
  const TIMED_OUT: AttemptResult = {
    state: "timed_out",
    waitedMs: 360_000,
    attempts: 120,
  };

  it("stops at the first attempt when the event lands", async () => {
    const a = attempts(FOUND);
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("found");
    expect(result.attemptsUsed).toBe(1);
    expect(a.seen).toEqual([1]);
  });

  it("sends a second probe when the first times out, and passes if that lands", async () => {
    const a = attempts(TIMED_OUT, FOUND);
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("found");
    expect(result.attemptsUsed).toBe(2);
    expect(a.seen).toEqual([1, 2]);
  });

  it("fails when every attempt times out, and keeps what each one waited", async () => {
    const a = attempts(TIMED_OUT, TIMED_OUT);
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("timed_out");
    expect(result.attemptsUsed).toBe(2);
    expect(result.timedOut).toHaveLength(2);
    expect(result.timedOut[0].waitedMs).toBe(360_000);
  });

  // A rejected query means the API key is wrong and an unreadable answer means
  // the query API changed shape. Neither is transient, so retrying spends the
  // whole budget again to be told the same thing, and worse, reports a
  // configuration fault as a slow one.
  it("does not retry a rejected query", async () => {
    const a = attempts({ state: "query_rejected", status: 401 }, FOUND);
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("query_rejected");
    expect(result.attemptsUsed).toBe(1);
    expect(a.seen).toEqual([1]);
  });

  it("does not retry an unreadable answer", async () => {
    const a = attempts(
      { state: "unreadable", because: "first row held no count" },
      FOUND,
    );
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("unreadable");
    expect(result.attemptsUsed).toBe(1);
  });

  it("does not retry a refused capture, which is not slowness either", async () => {
    const a = attempts({ state: "capture_rejected", status: 400 }, FOUND);
    const result = await runIngestionProbe({ attempt: a.attempt, maxAttempts: 2 });

    expect(result.final.state).toBe("capture_rejected");
    expect(result.attemptsUsed).toBe(1);
  });

  it("refuses a maxAttempts below one rather than reporting a pass it never ran", async () => {
    const a = attempts(FOUND);
    await expect(
      runIngestionProbe({ attempt: a.attempt, maxAttempts: 0 }),
    ).rejects.toThrow(/at least one/i);
    expect(a.seen).toEqual([]);
  });
});
