// @vitest-environment node
//
// The watchdog's reasoning (#837, #757).
//
// Every scheduled job in this repo alerts when it FAILS. Nothing noticed when
// one stopped firing at all, and those two look identical from outside: silence.
// GitHub disables a scheduled workflow after 60 days without repository
// activity, so the counter that watches CI can stop counting and go green
// forever (L13: a background job alerts on failure AND on the absence of an
// expected run).
//
// The interval every judgement rests on is DERIVED from each job's own cron
// expression rather than picked as a round number, because a threshold of a few
// days would fire every normal week on a weekly job (L172).
import { describe, it, expect } from "vitest";
import {
  parseCronSchedules,
  expectedIntervalMs,
  evaluateScheduledJobs,
  formatWatchdogReport,
  OVERDUE_FACTOR,
  collectScheduledWorkflows,
  runScheduledJobCheck,
} from "./scheduled-jobs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("parseCronSchedules", () => {
  it("reads the cron expressions out of a workflow's schedule block", () => {
    const yaml = [
      "name: CI Health",
      "on:",
      "  schedule:",
      '    - cron: "0 9 * * 1"',
      "  workflow_dispatch:",
      "jobs:",
      "  health:",
      "    runs-on: ubuntu-latest",
    ].join("\n");

    expect(parseCronSchedules(yaml)).toEqual(["0 9 * * 1"]);
  });

  it("reads every expression when a workflow has more than one", () => {
    const yaml = [
      "on:",
      "  schedule:",
      '    - cron: "0 13 * * *"',
      '    - cron: "0 1 * * *"',
      "  push:",
      "    branches: [main]",
    ].join("\n");

    expect(parseCronSchedules(yaml)).toEqual(["0 13 * * *", "0 1 * * *"]);
  });

  // A workflow that only runs on push has no interval to be overdue against.
  it("returns nothing for a workflow with no schedule", () => {
    const yaml = ["on:", "  push:", "    branches: [main]"].join("\n");
    expect(parseCronSchedules(yaml)).toEqual([]);
  });

  // A commented-out schedule is a schedule nobody runs. Reading it would make
  // the watchdog demand runs of a job that was deliberately turned off.
  it("ignores a cron line that is commented out", () => {
    const yaml = [
      "on:",
      "  schedule:",
      '    # - cron: "0 3 * * *"',
      '    - cron: "0 9 * * 1"',
    ].join("\n");

    expect(parseCronSchedules(yaml)).toEqual(["0 9 * * 1"]);
  });
});

describe("expectedIntervalMs", () => {
  it("measures a daily job as a day", () => {
    expect(expectedIntervalMs(["0 13 * * *"])).toBe(DAY);
  });

  it("measures a weekly job as a week", () => {
    expect(expectedIntervalMs(["0 9 * * 1"])).toBe(7 * DAY);
  });

  it("measures a quarter-hourly job as fifteen minutes", () => {
    expect(expectedIntervalMs(["*/15 * * * *"])).toBe(15 * 60 * 1000);
  });

  // Two schedules on one job fire more often than either alone, so the gap
  // that matters is the gap in their union.
  it("takes the largest gap across all of a job's schedules", () => {
    expect(expectedIntervalMs(["0 1 * * *", "0 13 * * *"])).toBe(12 * HOUR);
  });

  // A monthly job's gap depends on which month you measure, and the watchdog
  // must not accuse it during the longest one.
  it("uses the longest month for a monthly job, not the shortest", () => {
    expect(expectedIntervalMs(["0 13 1 * *"])).toBe(31 * DAY);
  });

  // An expression nothing can satisfy would otherwise measure as a zero
  // interval and put the job permanently overdue.
  it("refuses an expression that never fires", () => {
    expect(() => expectedIntervalMs(["0 13 30 2 *"])).toThrow(/never fires/i);
  });
});

describe("evaluateScheduledJobs", () => {
  const NOW = new Date("2026-09-01T12:00:00Z").getTime();

  function job(over: Partial<Parameters<typeof evaluateScheduledJobs>[0]["jobs"][number]>) {
    return {
      name: "CI Health",
      source: "ci-health.yml",
      crons: ["0 9 * * 1"],
      lastSuccessAt: new Date(NOW - 2 * DAY).toISOString(),
      ...over,
    };
  }

  it("passes a job that ran within its own interval", () => {
    const result = evaluateScheduledJobs({ jobs: [job({})], now: NOW });
    expect(result.overdue).toEqual([]);
    expect(result.checked).toBe(1);
  });

  it("does not accuse a weekly job that is merely a few days old", () => {
    // The failure this guards: a round threshold of "a few days" fires on every
    // normal week of a weekly job and teaches the reader to ignore it.
    const result = evaluateScheduledJobs({
      jobs: [job({ lastSuccessAt: new Date(NOW - 6 * DAY).toISOString() })],
      now: NOW,
    });
    expect(result.overdue).toEqual([]);
  });

  it("reports a weekly job that has not run for well over its interval", () => {
    const result = evaluateScheduledJobs({
      jobs: [job({ lastSuccessAt: new Date(NOW - 12 * DAY).toISOString() })],
      now: NOW,
    });
    expect(result.overdue).toHaveLength(1);
    expect(result.overdue[0].name).toBe("CI Health");
    expect(result.overdue[0].ageMs).toBeGreaterThan(7 * DAY);
  });

  it("judges a daily job against a day, not against the weekly one's interval", () => {
    const result = evaluateScheduledJobs({
      jobs: [
        job({
          name: "Migration Drift",
          crons: ["0 13 * * *"],
          lastSuccessAt: new Date(NOW - 3 * DAY).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(result.overdue).toHaveLength(1);
  });

  // A job that has never succeeded is the state a newly added job is in, and
  // also the state of one that has been broken since the day it landed. It is
  // overdue once a whole interval has passed since the watchdog first saw it,
  // never before: alerting on sight would fire on every new job.
  it("gives a job that has never run one interval of grace from when it was first seen", () => {
    const seen = new Date(NOW - 2 * DAY).toISOString();
    const fresh = evaluateScheduledJobs({
      jobs: [job({ lastSuccessAt: null, firstSeenAt: seen })],
      now: NOW,
    });
    expect(fresh.overdue).toEqual([]);

    const stale = evaluateScheduledJobs({
      jobs: [
        job({
          lastSuccessAt: null,
          firstSeenAt: new Date(NOW - 12 * DAY).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale.overdue).toHaveLength(1);
    expect(stale.overdue[0].neverRan).toBe(true);
  });

  /**
   * L50: a timestamp that does not parse yields NaN, and NaN compares false
   * against every threshold, so the job would read as healthy on the strength
   * of a value nobody could read. An unreadable answer is a failure of the
   * watchdog, not an all clear about the job.
   */
  it("refuses a last-run timestamp it cannot read, rather than passing the job", () => {
    expect(() =>
      evaluateScheduledJobs({
        jobs: [job({ lastSuccessAt: "not a date" })],
        now: NOW,
      }),
    ).toThrow(/could not be read/i);
  });

  /**
   * L98: a watcher that reports success when it found NOTHING to watch is
   * indistinguishable from one that saw everything pass. If the workflow
   * directory moves, or the API returns nothing, this must fail rather than
   * report a healthy repository nobody looked at.
   */
  it("refuses to report an all clear when it was given nothing to watch", () => {
    expect(() => evaluateScheduledJobs({ jobs: [], now: NOW })).toThrow(
      /nothing to watch/i,
    );
  });
});

describe("formatWatchdogReport", () => {
  const NOW = new Date("2026-09-01T12:00:00Z").getTime();

  it("names each overdue job, how long it has been silent, and where it lives", () => {
    const result = evaluateScheduledJobs({
      jobs: [
        {
          name: "CI Health",
          source: "ci-health.yml",
          crons: ["0 9 * * 1"],
          lastSuccessAt: new Date(NOW - 30 * DAY).toISOString(),
        },
      ],
      now: NOW,
    });

    const report = formatWatchdogReport(result);
    expect(report).toContain("CI Health");
    expect(report).toContain("ci-health.yml");
    expect(report).toMatch(/30 days/);
    // The remedy, not just the finding: GitHub disables a schedule silently.
    expect(report).toMatch(/disabl/i);
  });

  // The healthy report has to say how many jobs it checked. "All healthy" over
  // an empty list reads exactly the same as "all healthy" over a full one.
  it("says how many jobs it checked when everything is healthy", () => {
    const result = evaluateScheduledJobs({
      jobs: [
        {
          name: "Migration Drift",
          source: "migration-drift.yml",
          crons: ["0 13 * * *"],
          lastSuccessAt: new Date(NOW - HOUR).toISOString(),
        },
      ],
      now: NOW,
    });

    expect(formatWatchdogReport(result)).toMatch(/1 scheduled job/i);
  });
});

describe("OVERDUE_FACTOR", () => {
  // Named and exported so the calibration is one number in one place rather
  // than a literal repeated at each comparison.
  it("leaves headroom above a job's own interval rather than firing at it", () => {
    expect(OVERDUE_FACTOR).toBeGreaterThan(1);
    expect(OVERDUE_FACTOR).toBeLessThan(3);
  });
});

describe("collectScheduledWorkflows", () => {
  it("finds every workflow that has a schedule, and skips the ones that do not", () => {
    const jobs = collectScheduledWorkflows([
      {
        path: ".github/workflows/ci-health.yml",
        contents: 'name: CI Health\non:\n  schedule:\n    - cron: "0 9 * * 1"\n',
      },
      {
        path: ".github/workflows/ci.yml",
        contents: "name: CI\non:\n  pull_request:\n    branches: [main]\n",
      },
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe("CI Health");
    expect(jobs[0].source).toBe("ci-health.yml");
    expect(jobs[0].crons).toEqual(["0 9 * * 1"]);
  });

  // The watched set is derived from the directory, so a scheduled workflow
  // added later is watched without anybody remembering to list it (L41, L96).
  it("names a workflow by its file when the file declares no name", () => {
    const jobs = collectScheduledWorkflows([
      {
        path: ".github/workflows/nameless.yml",
        contents: 'on:\n  schedule:\n    - cron: "0 3 * * *"\n',
      },
    ]);
    expect(jobs[0].name).toBe("nameless.yml");
  });
});

describe("runScheduledJobCheck", () => {
  const NOW = new Date("2026-09-01T12:00:00Z").getTime();
  const DAY = 24 * 60 * 60 * 1000;

  function spyAnnounce() {
    const calls: Array<{ title: string; report: string }> = [];
    return {
      calls,
      impl: async (args: { title: string; report: string }) => {
        calls.push(args);
      },
    };
  }

  const healthy = [
    {
      name: "Migration Drift",
      source: "migration-drift.yml",
      crons: ["0 13 * * *"],
      lastSuccessAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    },
  ];

  it("stays quiet and exits zero when every job is running", async () => {
    const announce = spyAnnounce();
    const code = await runScheduledJobCheck({
      loadJobs: async () => healthy,
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
      now: NOW,
    });

    expect(code).toBe(0);
    expect(announce.calls).toHaveLength(0);
  });

  it("alerts and exits non zero when a job has gone silent", async () => {
    const announce = spyAnnounce();
    const code = await runScheduledJobCheck({
      loadJobs: async () => [
        { ...healthy[0], lastSuccessAt: new Date(NOW - 5 * DAY).toISOString() },
      ],
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
      now: NOW,
    });

    expect(code).toBe(1);
    expect(announce.calls).toHaveLength(1);
    expect(announce.calls[0].title).toMatch(/stopped running/i);
    expect(announce.calls[0].report).toContain("Migration Drift");
  });

  /**
   * The watchdog failing to READ the state and the state being bad are two
   * different failures with two different remedies, and the first one must
   * never be reported as an all clear (L98, L11).
   */
  it("alerts with its own wording when it could not read the state at all", async () => {
    const announce = spyAnnounce();
    const code = await runScheduledJobCheck({
      loadJobs: async () => {
        throw new Error("GitHub API returned 403");
      },
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
      now: NOW,
    });

    expect(code).toBe(1);
    expect(announce.calls).toHaveLength(1);
    expect(announce.calls[0].title).toMatch(/could not run/i);
    expect(announce.calls[0].title).not.toMatch(/stopped running/i);
    expect(announce.calls[0].report).toContain("403");
  });

  it("treats an empty job list as its own failure, not as an all clear", async () => {
    const announce = spyAnnounce();
    const code = await runScheduledJobCheck({
      loadJobs: async () => [],
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
      now: NOW,
    });

    expect(code).toBe(1);
    expect(announce.calls[0].title).toMatch(/could not run/i);
    expect(announce.calls[0].report).toMatch(/nothing to watch/i);
  });
});
