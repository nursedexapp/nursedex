import { describe, it, expect } from "vitest";
import { planOutageAlert, outageMessage, recoveryMessage } from "./outage";

const MINUTE = 60 * 1000;
const now = new Date("2026-10-20T18:45:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);

/**
 * sentry-alerts runs every 15 minutes. On 2026-10-20 a Sentry outage paged
 * the channel on every run (2:15, 2:30, 2:45 PM ET), each one reading like a
 * fault of ours. The job's own last success is the only state needed: if the
 * run before this one got through, this is the start of an outage.
 */
describe("planOutageAlert", () => {
  it("pages when the run before this one got through", () => {
    expect(planOutageAlert({ lastSuccessAt: ago(15), now })).toBe("first");
  });

  it("still treats a late previous run as the one before this", () => {
    expect(planOutageAlert({ lastSuccessAt: ago(24), now })).toBe("first");
  });

  it("stays quiet once a run has already failed", () => {
    expect(planOutageAlert({ lastSuccessAt: ago(30), now })).toBe("quiet");
    expect(planOutageAlert({ lastSuccessAt: ago(105), now })).toBe("quiet");
  });

  it("reminds once when the outage reaches two hours", () => {
    expect(planOutageAlert({ lastSuccessAt: ago(120), now })).toBe("reminder");
    expect(planOutageAlert({ lastSuccessAt: ago(134), now })).toBe("reminder");
    expect(planOutageAlert({ lastSuccessAt: ago(135), now })).toBe("quiet");
  });

  it("reminds again every two hours after that", () => {
    expect(planOutageAlert({ lastSuccessAt: ago(225), now })).toBe("quiet");
    expect(planOutageAlert({ lastSuccessAt: ago(240), now })).toBe("reminder");
  });

  // Every 15 minute run of a long outage, so the cadence is measured over the
  // runs that would really happen rather than hand picked instants.
  it("pages exactly once at the start and once per two hours across a long outage", () => {
    const lastSuccessAt = ago(0);
    const plans = [];
    for (let run = 1; run <= 24; run++) {
      plans.push(
        planOutageAlert({
          lastSuccessAt,
          now: new Date(lastSuccessAt.getTime() + run * 15 * MINUTE),
        }),
      );
    }
    expect(plans.filter((p) => p === "first")).toHaveLength(1);
    expect(plans.filter((p) => p === "reminder")).toHaveLength(3);
    expect(plans.filter((p) => p !== "quiet")).toHaveLength(4);
  });

  // Not knowing is not the same as knowing it already paged: a failure we
  // cannot place in an outage pages rather than hiding.
  it("pages when the last success could not be read", () => {
    expect(planOutageAlert({ lastSuccessAt: undefined, now })).toBe("first");
  });

  it("pages when the job has never got through", () => {
    expect(planOutageAlert({ lastSuccessAt: null, now })).toBe("first");
  });
});

describe("outageMessage", () => {
  it("says it is Sentry, that nothing is lost, and what happens next", () => {
    const text = outageMessage({
      kind: "first",
      status: 503,
      lastSuccessAt: ago(15),
      now,
    });
    expect(text).toContain("Sentry is down");
    expect(text).toContain("503");
    expect(text).toContain("Nothing is lost");
    expect(text).toContain("https://status.sentry.io");
    expect(text).toContain("A message follows when it is back");
  });

  it("names a connection that never answered rather than a status", () => {
    const text = outageMessage({
      kind: "first",
      status: null,
      lastSuccessAt: ago(15),
      now,
    });
    expect(text).toContain("no answer");
    expect(text).not.toContain("null");
  });

  it("says how long it has been down in a reminder", () => {
    const text = outageMessage({
      kind: "reminder",
      status: 504,
      lastSuccessAt: ago(240),
      now,
    });
    expect(text).toContain("still down");
    expect(text).toContain("4 hours");
  });
});

describe("recoveryMessage", () => {
  it("says nothing when the run before this one got through", () => {
    expect(recoveryMessage({ lastSuccessAt: ago(15), now })).toBeNull();
  });

  it("announces recovery after at least one failed run, with how long it took", () => {
    const text = recoveryMessage({ lastSuccessAt: ago(45), now });
    expect(text).toContain("sentry-alerts");
    expect(text).toContain("working again");
    expect(text).toContain("45 minutes");
  });

  it("says nothing when the last success is unknown or never happened", () => {
    expect(recoveryMessage({ lastSuccessAt: undefined, now })).toBeNull();
    expect(recoveryMessage({ lastSuccessAt: null, now })).toBeNull();
  });
});
