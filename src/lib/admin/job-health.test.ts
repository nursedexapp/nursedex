// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: h.rows, error: h.error }),
    }),
  }),
}));

import { getJobHealth } from "./job-health";
import { scheduledCrons } from "@/lib/cron/vercel-crons";
import {
  evaluateScheduledJobs,
  expectedIntervalMs,
  OVERDUE_FACTOR,
} from "@/lib/cron/schedule-health";

const NOW = new Date("2026-09-03T12:00:00Z");

/** A daily cron, which most of them are. */
const daily = scheduledCrons().find(
  (c) => expectedIntervalMs(c.schedules) === 24 * 60 * 60 * 1000,
)!;

function beat(name: string, fields: Record<string, unknown>) {
  return {
    job_name: name,
    first_seen_at: null,
    last_success_at: null,
    last_duration_ms: null,
    last_result: null,
    ...fields,
  };
}

beforeEach(() => {
  h.rows = [];
  h.error = null;
});

describe("getJobHealth", () => {
  it("returns one row per scheduled cron, whether or not it has a heartbeat", async () => {
    const health = await getJobHealth(NOW);

    expect(health.rows).toHaveLength(scheduledCrons().length);
    expect(health.rows.map((r) => r.name).sort()).toEqual(
      scheduledCrons()
        .map((c) => c.name)
        .sort(),
    );
  });

  it("calls a job with no heartbeat row never-ran, not ok", async () => {
    const health = await getJobHealth(NOW);

    for (const row of health.rows) {
      expect(row.status).toBe("never-ran");
      expect(row.ageMs).toBeNull();
    }
  });

  it("calls a job that ran within its own interval ok", async () => {
    h.rows = [
      beat(daily.name, {
        last_success_at: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
        last_duration_ms: 1200,
      }),
    ];

    const health = await getJobHealth(NOW);
    const row = health.rows.find((r) => r.name === daily.name)!;

    expect(row.status).toBe("ok");
    expect(row.ageMs).toBe(60 * 60 * 1000);
    expect(row.lastDurationMs).toBe(1200);
  });

  it("calls a job that has gone past its own interval overdue", async () => {
    const interval = expectedIntervalMs(daily.schedules);
    h.rows = [
      beat(daily.name, {
        last_success_at: new Date(
          NOW.getTime() - interval * OVERDUE_FACTOR - 1000,
        ).toISOString(),
      }),
    ];

    const health = await getJobHealth(NOW);
    expect(health.rows.find((r) => r.name === daily.name)!.status).toBe(
      "overdue",
    );
  });

  // A job added today should not be reported as a problem before its first
  // scheduled run, which is what first_seen_at is for.
  it("gives a job that has never run its first interval of grace", async () => {
    h.rows = [
      beat(daily.name, {
        first_seen_at: new Date(NOW.getTime() - 60 * 1000).toISOString(),
      }),
    ];

    const health = await getJobHealth(NOW);
    expect(health.rows.find((r) => r.name === daily.name)!.status).toBe(
      "never-ran",
    );
  });

  it("calls a job that has never run and is past its grace overdue", async () => {
    const interval = expectedIntervalMs(daily.schedules);
    h.rows = [
      beat(daily.name, {
        first_seen_at: new Date(
          NOW.getTime() - interval * OVERDUE_FACTOR - 1000,
        ).toISOString(),
      }),
    ];

    const health = await getJobHealth(NOW);
    expect(health.rows.find((r) => r.name === daily.name)!.status).toBe(
      "overdue",
    );
  });

  // An unparseable timestamp must not land on the healthy side: NaN compares
  // false against every threshold, so a naive check would call it ok.
  it("does not call a job with an unreadable timestamp ok", async () => {
    h.rows = [beat(daily.name, { last_success_at: "not a date" })];

    const health = await getJobHealth(NOW);
    expect(health.rows.find((r) => r.name === daily.name)!.status).not.toBe(
      "ok",
    );
  });

  // The one failure that must never render as a healthy page.
  it("throws when the read fails, rather than reporting no jobs and no problems", async () => {
    h.error = { message: "connection refused" };

    await expect(getJobHealth(NOW)).rejects.toThrow(/connection refused/);
  });
});

// The page and the watchdog must not be able to disagree about whether a job
// is overdue. They share expectedIntervalMs and OVERDUE_FACTOR; this asserts
// the verdicts actually match rather than trusting that they do.
describe("the page agrees with the watchdog", () => {
  it("marks overdue exactly the jobs the watchdog would alert on", async () => {
    const interval = expectedIntervalMs(daily.schedules);
    const stale = new Date(
      NOW.getTime() - interval * OVERDUE_FACTOR - 1000,
    ).toISOString();
    const fresh = new Date(NOW.getTime() - 60 * 1000).toISOString();

    for (const [label, lastSuccessAt] of [
      ["stale", stale],
      ["fresh", fresh],
    ] as const) {
      h.rows = [beat(daily.name, { last_success_at: lastSuccessAt })];

      const health = await getJobHealth(NOW);
      const pageSaysOverdue =
        health.rows.find((r) => r.name === daily.name)!.status === "overdue";

      const watchdog = evaluateScheduledJobs({
        jobs: [
          {
            name: daily.name,
            source: "vercel.json",
            crons: daily.schedules,
            lastSuccessAt,
          },
        ],
        now: NOW.getTime(),
      });
      const watchdogSaysOverdue = watchdog.overdue.length > 0;

      expect(pageSaysOverdue, `${label} run`).toBe(watchdogSaysOverdue);
    }
  });
});
