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
  collectVercelCronJobs,
  attachHeartbeats,
  parseMaxDurationSeconds,
  fetchHeartbeatRows,
  selfWorkflowSource,
  loadGitHubWorkflowJobs,
  type ScheduledJob,
  type WatchdogResult,
  type OverdueJob,
  type AnnouncedState,
  decideAnnouncement,
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

  function job(
    over: Partial<Parameters<typeof evaluateScheduledJobs>[0]["jobs"][number]>,
  ) {
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

  /**
   * L11: a message may claim only what its check actually measured. What is
   * measured is the last SUCCESSFUL run, so a job that fires every day and
   * fails every day reads the same as one nothing is dispatching. Those are
   * different problems with different remedies, and the failing one is already
   * alerting on its own, so the wording must not assert the job is absent.
   */
  it("says what it measured, not that the job has stopped firing", () => {
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
    expect(report).toMatch(/not completed successfully|no successful/i);
    // It may be failing rather than absent, and the reader has to be told to
    // look at both.
    expect(report).toMatch(/failing/i);
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
        contents:
          'name: CI Health\non:\n  schedule:\n    - cron: "0 9 * * 1"\n',
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
    expect(announce.calls[0].title).toMatch(/not completing/i);
    expect(announce.calls[0].report).toContain("Migration Drift");
  });

  /**
   * A job that is still running but nearly out of time is a different finding
   * from one that has stopped, and it is worth failing on: at current volumes
   * nothing is close, so this fires only when something genuinely is (L11).
   */
  it("alerts in its own words when a job is close to its time budget", async () => {
    const announce = spyAnnounce();
    const code = await runScheduledJobCheck({
      loadJobs: async () => [
        {
          ...healthy[0],
          lastDurationMs: 58_000,
          maxDurationMs: 60_000,
        },
      ],
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
      now: NOW,
    });

    expect(code).toBe(1);
    expect(announce.calls).toHaveLength(1);
    expect(announce.calls[0].title).toMatch(/time budget/i);
    expect(announce.calls[0].title).not.toMatch(/not completing/i);
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
    expect(announce.calls[0].title).not.toMatch(/not completing/i);
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

describe("collectVercelCronJobs", () => {
  const VERCEL_JSON = JSON.stringify({
    crons: [
      { path: "/api/cron/access-expiry", schedule: "0 5 * * *" },
      { path: "/api/cron/sentry-alerts", schedule: "*/15 * * * *" },
    ],
  });

  it("names each cron the way withCronAlerting names it", () => {
    const jobs = collectVercelCronJobs(VERCEL_JSON);

    expect(jobs.map((j) => j.name)).toEqual(["access-expiry", "sentry-alerts"]);
    expect(jobs[0].crons).toEqual(["0 5 * * *"]);
    expect(jobs[0].source).toContain("vercel.json");
  });

  /**
   * The watched set is derived from vercel.json, so a cron added later is
   * watched without anybody adding it to a list here (L41, L96). If the file
   * ever stops declaring crons, that is a broken read, not a repository with
   * no scheduled work.
   */
  it("refuses a vercel.json with no crons at all", () => {
    expect(() => collectVercelCronJobs('{"crons":[]}')).toThrow(/no crons/i);
  });
});

describe("attachHeartbeats", () => {
  const jobs = [
    { name: "access-expiry", source: "vercel.json", crons: ["0 5 * * *"] },
    { name: "review-invite", source: "vercel.json", crons: ["0 13 * * *"] },
  ];

  it("gives each job the row that belongs to it", () => {
    const attached = attachHeartbeats(jobs, [
      {
        job_name: "access-expiry",
        first_seen_at: "2026-08-01T00:00:00Z",
        last_success_at: "2026-09-01T05:00:00Z",
        last_duration_ms: 1200,
      },
    ]);

    expect(attached[0].lastSuccessAt).toBe("2026-09-01T05:00:00Z");
    expect(attached[0].lastDurationMs).toBe(1200);
  });

  /**
   * A cron with no row has never got through since the table existed. That is
   * a real state (a newly added job, or one broken since it landed), and it is
   * told apart from a job that ran long ago by first_seen_at being absent too,
   * which leaves the grace period to be decided from when the watchdog first
   * saw it.
   */
  it("leaves a job with no row marked as never having run", () => {
    const attached = attachHeartbeats(jobs, []);
    expect(attached[1].lastSuccessAt).toBeNull();
  });

  // A row for a cron that is no longer in vercel.json is a leftover, not a job.
  // It must not appear in the watched set, or the watchdog reports on something
  // that cannot run.
  it("ignores a row whose job is no longer scheduled", () => {
    const attached = attachHeartbeats(jobs, [
      { job_name: "deleted-job", last_success_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(attached).toHaveLength(2);
    expect(attached.map((j) => j.name)).not.toContain("deleted-job");
  });
});

describe("parseMaxDurationSeconds", () => {
  it("reads the route's declared budget", () => {
    expect(parseMaxDurationSeconds("export const maxDuration = 60;\n")).toBe(
      60,
    );
  });

  it("returns null when a route declares none", () => {
    expect(
      parseMaxDurationSeconds("export const runtime = 'nodejs';"),
    ).toBeNull();
  });
});

describe("runs approaching their time budget", () => {
  const NOW = new Date("2026-09-01T12:00:00Z").getTime();

  function job(over: Record<string, unknown> = {}) {
    return {
      name: "renewal-reminder",
      source: "vercel.json",
      crons: ["0 14 * * *"],
      lastSuccessAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
      maxDurationMs: 60_000,
      ...over,
    };
  }

  /**
   * #440: these crons send emails one at a time inside a fixed budget. A run
   * that hits the ceiling sends a prefix of its batch and returns nothing to
   * say so, so the first sign would be a customer who never got an email. The
   * run before that one is the warning, and this is what reads it.
   */
  it("reports a run that used most of its budget", () => {
    const result = evaluateScheduledJobs({
      jobs: [job({ lastDurationMs: 55_000 })],
      now: NOW,
    });

    expect(result.nearBudget).toHaveLength(1);
    expect(result.nearBudget[0].name).toBe("renewal-reminder");
  });

  it("says nothing about a run well inside its budget", () => {
    const result = evaluateScheduledJobs({
      jobs: [job({ lastDurationMs: 1_500 })],
      now: NOW,
    });

    expect(result.nearBudget).toEqual([]);
  });

  // Without a declared budget there is nothing to be near, and inventing one
  // would report against a number nobody set.
  it("judges nothing when the route declares no budget", () => {
    const result = evaluateScheduledJobs({
      jobs: [job({ lastDurationMs: 55_000, maxDurationMs: null })],
      now: NOW,
    });

    expect(result.nearBudget).toEqual([]);
  });

  it("names the job and both numbers in the report", () => {
    const result = evaluateScheduledJobs({
      jobs: [job({ lastDurationMs: 55_000 })],
      now: NOW,
    });

    const report = formatWatchdogReport(result);
    expect(report).toContain("renewal-reminder");
    expect(report).toMatch(/55/);
    expect(report).toMatch(/60/);
  });
});

describe("fetchHeartbeatRows", () => {
  const URL = "https://nursedex.com/api/internal/job-heartbeats";

  function response(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  }

  it("sends the reader's own credential and returns the rows", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const rows = await fetchHeartbeatRows({
      url: URL,
      secret: "hb-secret",
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([String(input), init]);
        return response({ jobs: [{ job_name: "access-expiry" }] });
      },
    });

    expect(calls[0][0]).toBe(URL);
    expect(calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer hb-secret",
    });
    expect(rows).toHaveLength(1);
  });

  /**
   * Without the secret the request would go out unauthenticated, come back 401,
   * and the failure would name the endpoint rather than the missing
   * configuration that actually caused it (L11).
   */
  it("refuses before sending anything when it has no credential", async () => {
    await expect(
      fetchHeartbeatRows({
        url: URL,
        secret: undefined,
        fetchImpl: async () => {
          throw new Error("should never be called");
        },
      }),
    ).rejects.toThrow(/HEARTBEAT_READ_SECRET/);
  });

  /**
   * A refused or broken read must never come back as an empty list. The
   * watchdog reads a job with no row as one that has never run, so an empty
   * list here would accuse every cron at once and send the reader to the wrong
   * place entirely (L215, L11).
   */
  it("throws on a refused read rather than returning nothing", async () => {
    await expect(
      fetchHeartbeatRows({
        url: URL,
        secret: "wrong",
        fetchImpl: async () =>
          response({ error: "Unauthorized" }, { status: 401 }),
      }),
    ).rejects.toThrow(/401/);
  });

  it("throws when the payload holds no jobs array", async () => {
    await expect(
      fetchHeartbeatRows({
        url: URL,
        secret: "hb-secret",
        fetchImpl: async () => response({ unexpected: true }),
      }),
    ).rejects.toThrow(/jobs/i);
  });

  // An empty table is a real state, not a failure: it is what a deployment
  // before the first cron run looks like, and the evaluation handles it by
  // treating each job as never having run.
  it("accepts an empty list, which is what a fresh deployment looks like", async () => {
    await expect(
      fetchHeartbeatRows({
        url: URL,
        secret: "hb-secret",
        fetchImpl: async () => response({ jobs: [] }),
      }),
    ).resolves.toEqual([]);
  });
});

// The watchdog watches itself, and on 2026-09-05 that turned into a latch it
// could not get out of (#1039).
//
// Third Party Health genuinely failed on 2026-09-03. The watchdog correctly
// reported it and exited 1 on the 4th, which is what it is for. But its own
// failure stopped its own success clock, so on the 5th it looked at itself,
// found 47 hours with no success, reported that, and failed again. From then
// on every run pushed its own clock a further day out. Third Party Health had
// recovered hours after being reported and nothing else was ever wrong.
//
// The fix is scoped to the one entry that causes it: the watchdog judges
// ITSELF on whether its schedule still fires, not on whether the run passed.
// That is the distinction its own alert text already draws. A watchdog that
// runs and fails is already alerting through its own red run; the thing only
// it can detect about itself is GitHub disabling the schedule (L324: the stand
// down is no broader than the reason for standing down).
describe("selfWorkflowSource", () => {
  it("names the workflow file this run is executing as", () => {
    expect(
      selfWorkflowSource({
        GITHUB_WORKFLOW_REF:
          "nursedexapp/nursedex/.github/workflows/job-watchdog.yml@refs/heads/main",
      }),
    ).toBe("job-watchdog.yml");
  });

  it("is null when nothing is running as a workflow, so a local run is unaffected", () => {
    expect(selfWorkflowSource({})).toBeNull();
  });

  /**
   * The failure path. Without a self reference every job is judged by success
   * again, including this one, and the latch comes back with no symptom at all
   * until two days later. In CI the variable is always set, so its absence is
   * a broken watchdog rather than a job to report on (L11, L289).
   */
  it("refuses to run inside CI without one, rather than silently latching again", () => {
    expect(() => selfWorkflowSource({ GITHUB_ACTIONS: "true" })).toThrow(
      /GITHUB_WORKFLOW_REF/,
    );
  });
});

describe("loadGitHubWorkflowJobs", () => {
  const NOW = Date.UTC(2026, 8, 5, 10, 40, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  const FILES = [
    {
      path: ".github/workflows/job-watchdog.yml",
      contents: 'name: Job Watchdog\non:\n  schedule:\n    - cron: "20 6 * * *"\n',
    },
    {
      path: ".github/workflows/health-checks.yml",
      contents:
        'name: Third Party Health\non:\n  schedule:\n    - cron: "0 15 * * *"\n',
    },
  ];

  /**
   * GitHub as it actually behaved on the day. Both workflows were dispatched
   * two hours ago; the watchdog's last SUCCESSFUL scheduled run was three days
   * back, because it has been failing on its own reading of itself ever since.
   */
  function fakeApi() {
    const calls: string[] = [];
    const api = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      const succeeded = path.includes("status=success");
      const isWatchdog = path.includes("job-watchdog.yml");
      const at =
        isWatchdog && succeeded ? NOW - 3 * DAY : NOW - 2 * HOUR;
      return { workflow_runs: [{ updated_at: iso(at) }] } as T;
    };
    return { api, calls };
  }

  it("judges the watchdog's own schedule by whether it fired, not by whether it passed", async () => {
    const { api } = fakeApi();
    const jobs = await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: "job-watchdog.yml",
    });

    const result = evaluateScheduledJobs({ jobs, now: NOW });
    expect(result.overdue).toEqual([]);
    expect(result.checked).toBe(2);
  });

  /**
   * The same fixture with nothing treated as self. This is what shipped, and
   * it has to still reproduce the latch, or the test above passes for a reason
   * unrelated to the fix (L159).
   */
  it("reproduces the latch when no entry is treated as its own", async () => {
    const { api } = fakeApi();
    const jobs = await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: null,
    });

    const result = evaluateScheduledJobs({ jobs, now: NOW });
    expect(result.overdue.map((j) => j.source)).toEqual(["job-watchdog.yml"]);
  });

  it("still judges every other workflow by its last SUCCESSFUL scheduled run", async () => {
    const { api, calls } = fakeApi();
    await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: "job-watchdog.yml",
    });

    // The JUDGING call, not every call: since #1041 each non-self workflow
    // also gets a supplementary read of its last run whatever the conclusion,
    // which deliberately carries no status filter. What this asserts is that
    // the timestamp the check is judged on still comes from a successful run.
    const others = calls.filter((p) => !p.includes("job-watchdog.yml"));
    expect(others.filter((p) => p.includes("status=success")).length).toBe(1);

    const own = calls.filter((p) => p.includes("job-watchdog.yml"));
    expect(own.length).toBeGreaterThan(0);
    for (const path of own) expect(path).not.toContain("status=success");
  });

  /**
   * A run somebody started by hand proves the job still works, not that GitHub
   * is still firing it, and a schedule GitHub has disabled is the whole thing
   * this exists to catch. That holds for the relaxed self reading too.
   */
  it("asks only about scheduled runs, including its own", async () => {
    const { api, calls } = fakeApi();
    await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: "job-watchdog.yml",
    });
    for (const path of calls) expect(path).toContain("event=schedule");
  });

  it("says it was last dispatched, not that it succeeded, when its own schedule has stopped", () => {
    const report = formatWatchdogReport(
      evaluateScheduledJobs({
        jobs: [
          {
            name: "Job Watchdog",
            source: "job-watchdog.yml",
            crons: ["20 6 * * *"],
            lastSuccessAt: iso(NOW - 5 * DAY),
            measuredBy: "dispatch",
          },
        ],
        now: NOW,
      }),
    );
    expect(report).toContain("was last dispatched");
    expect(report).not.toContain("Job Watchdog (job-watchdog.yml) last succeeded");
  });
});

/**
 * #1041 and #1077. The overdue message used to offer the reader two
 * possibilities and decline to choose between them, then recommend a remedy
 * that cannot settle either.
 *
 * On 2026-09-15 it reported that Stale Pull Requests had never completed
 * successfully. The cause was a third case the message does not name: both
 * scheduled runs ever dispatched started and completed inside two seconds
 * having executed no steps at all, carrying GitHub's own annotation that the
 * job was not started because account payments had failed. GitHub accepted the
 * schedule, dispatched the run, and refused to start the job. That is neither
 * "the schedule stopped" nor "the job is broken and already alerting
 * elsewhere", because a workflow with no failure alerting of its own produces
 * a red run nobody has a reason to open.
 */
describe("which of the dispatch states an overdue job is in", () => {
  const NOW = new Date("2026-09-15T12:00:00Z").getTime();

  const weekly = (lastDispatch: ScheduledJob["lastDispatch"]): WatchdogResult =>
    evaluateScheduledJobs({
      jobs: [
        {
          name: "Stale Pull Requests",
          source: "stale-prs.yml",
          crons: ["0 7 * * 1"],
          lastSuccessAt: null,
          firstSeenAt: new Date(NOW - 30 * DAY).toISOString(),
          lastDispatch,
        },
      ],
      now: NOW,
    });

  it("says the schedule has stopped when nothing was dispatched at all", () => {
    const report = formatWatchdogReport(weekly(null));

    expect(report).toMatch(/not been dispatched|nothing.*dispatched/i);
    // It must NOT accuse the job of being broken: nothing ran to be broken.
    expect(report).not.toMatch(/refused to start/i);
  });

  it("sends the reader to the run log when a run executed and failed", () => {
    const report = formatWatchdogReport(
      weekly({
        conclusion: "failure",
        at: new Date(NOW - 1 * DAY).toISOString(),
        ranAnySteps: true,
        refusal: null,
      }),
    );

    // The three claims that matter: it ran, it did not succeed, and the log
    // is where the answer is. Not one spelling of them (L103).
    expect(report).toMatch(/steps executed/i);
    expect(report).toContain("failure");
    expect(report).toMatch(/read that run's log/i);
    expect(report).not.toMatch(/refused to start/i);
  });

  /**
   * The state that cost a week. A refused run is indistinguishable from a
   * failed one in every list (L276), so the message has to make the
   * distinction the list cannot, and quote GitHub's own words for it: the
   * remedy is on the billing account and nowhere near the job.
   */
  it("names a refusal, and quotes it, when the run executed no steps", () => {
    const report = formatWatchdogReport(
      weekly({
        conclusion: "failure",
        at: new Date(NOW - 1 * DAY).toISOString(),
        ranAnySteps: false,
        refusal:
          "The job was not started because recent account payments have failed",
      }),
    );

    expect(report).toMatch(/refused to start/i);
    expect(report).toContain("recent account payments have failed");
    // The reader must not be sent to read a log: a refused run has none.
    expect(report).not.toMatch(/read that run's log/i);
  });
});

describe("what the alert tells the reader to do about it", () => {
  const NOW = new Date("2026-09-15T12:00:00Z").getTime();

  /**
   * #1077. The message used to end "re-run the job by hand to confirm it still
   * works". A hand run cannot satisfy this check: every entry is queried with
   * event=schedule, deliberately, because a hand run proves the script works
   * and not that GitHub is still firing it. So the reader does exactly what the
   * alert says, sees a green run, and the next reading reports the identical
   * finding. Confirmed on 2026-09-15 by dispatching stale-prs.yml by hand.
   *
   * L36: never embed canned remediation text that can steer a diagnosis wrong.
   */
  it("says a hand run will not clear the check, when it suggests one", () => {
    const report = formatWatchdogReport(
      evaluateScheduledJobs({
        jobs: [
          {
            name: "Stale Pull Requests",
            source: "stale-prs.yml",
            crons: ["0 7 * * 1"],
            lastSuccessAt: null,
            firstSeenAt: new Date(NOW - 30 * DAY).toISOString(),
            lastDispatch: null,
          },
        ],
        now: NOW,
      }),
    );

    expect(report).toMatch(/by hand/i);
    // The claim that matters: it proves the script, it does not clear this.
    expect(report).toMatch(/will not clear|does not clear|cannot clear/i);
    expect(report).toMatch(/scheduled run/i);
  });
});

/**
 * #1041, the reading side. The report can only name a dispatch state if
 * something puts one there, and a feature that is built but not wired is not
 * a feature (L3).
 */
describe("reading which state an overdue workflow is in", () => {
  const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  const FILES = [
    {
      path: ".github/workflows/stale-prs.yml",
      contents:
        'name: Stale Pull Requests\non:\n  schedule:\n    - cron: "0 7 * * 1"\n',
    },
  ];

  /**
   * GitHub as it actually answered on 2026-09-15. No successful scheduled run
   * has ever existed; the last one GitHub dispatched completed in two seconds
   * with an empty steps list and a billing annotation.
   */
  function refusedApi() {
    const calls: string[] = [];
    return {
      calls,
      api: async <T,>(path: string): Promise<T> => {
        calls.push(path);
        // Order matters: the jobs URL is /actions/runs/<id>/jobs, so it also
        // contains "/runs". A double that selects what it intercepts by
        // pattern becomes no double at all when the pattern is too loose, and
        // the test then measures the wrong call (L143).
        if (path.includes("status=success")) return { workflow_runs: [] } as T;
        if (path.includes("/annotations"))
          return [
            {
              annotation_level: "failure",
              message:
                "The job was not started because recent account payments have failed",
            },
          ] as T;
        if (path.endsWith("/jobs"))
          return {
            jobs: [{ id: 103994245503, conclusion: "failure", steps: [] }],
          } as T;
        if (path.includes("/runs"))
          return {
            workflow_runs: [
              {
                id: 34849707548,
                conclusion: "failure",
                updated_at: iso(NOW - 1 * DAY),
              },
            ],
          } as T;
        return { created_at: iso(NOW - 40 * DAY) } as T;
      },
    };
  }

  it("carries the refusal through to the report, quoted", async () => {
    const { api } = refusedApi();

    const jobs = await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: null,
    });

    expect(jobs[0].lastDispatch).toMatchObject({
      ranAnySteps: false,
      conclusion: "failure",
    });

    const report = formatWatchdogReport(
      evaluateScheduledJobs({ jobs, now: NOW }),
    );
    expect(report).toMatch(/refused to start/i);
    expect(report).toContain("recent account payments have failed");
  });

  /**
   * A read that FAILED must not arrive as "nothing was dispatched", which is a
   * finding with its own remedy. An unreadable answer and a dead schedule are
   * different things and only one is fixed by re-enabling a schedule (L11).
   */
  it("does not report a failed annotation read as a job that never ran", async () => {
    const api = async <T,>(path: string): Promise<T> => {
      if (path.includes("status=success")) return { workflow_runs: [] } as T;
      if (path.endsWith("/jobs")) throw new Error("GitHub API 502");
      if (path.includes("/runs"))
        return {
          workflow_runs: [
            { id: 1, conclusion: "failure", updated_at: iso(NOW - DAY) },
          ],
        } as T;
      return { created_at: iso(NOW - 40 * DAY) } as T;
    };

    const jobs = await loadGitHubWorkflowJobs({
      repo: "nursedexapp/nursedex",
      files: FILES,
      api,
      selfSource: null,
    });

    // It knows a run exists. What it could not read is whether steps ran, and
    // it must not answer that question by guessing in either direction.
    expect(jobs[0].lastDispatch).not.toBeNull();
    expect(jobs[0].lastDispatch?.conclusion).toBe("failure");
    expect(jobs[0].lastDispatch?.ranAnySteps).toBeNull();

    // And the message must not CLAIM steps ran, nor claim a refusal. It says
    // it could not tell, and still sends the reader somewhere useful (L11).
    const report = formatWatchdogReport(
      evaluateScheduledJobs({ jobs, now: NOW }),
    );
    expect(report).not.toMatch(/steps executed/i);
    expect(report).not.toMatch(/refused to start/i);
    expect(report).toMatch(/could not be read/i);
    expect(report).toMatch(/log/i);
  });
});

/**
 * #1078. The watchdog fires on a daily backstop cron AND on every completion
 * of Production Smoke, which runs on every push to main. An overdue finding
 * stays true until the watched job's next scheduled run succeeds, which for a
 * weekly job is up to six days, so the identical Slack message went out once
 * per merge for most of a week. Nothing rate limited it but how often the repo
 * was pushed to. L36 asks for deduped repeats.
 */
describe("holding a finding that has not changed", () => {
  const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
  const WEEK = 7 * DAY;

  const overdue = (over: Partial<OverdueJob> = {}): OverdueJob => ({
    name: "Stale Pull Requests",
    source: "stale-prs.yml",
    ageMs: 30 * DAY,
    intervalMs: WEEK,
    neverRan: true,
    measuredBy: "success",
    ...over,
  });

  const seen = (jobs: OverdueJob[]): WatchdogResult => ({
    checked: 2,
    overdue: jobs,
    nearBudget: [],
  });

  it("announces a finding nothing has said before", () => {
    const decision = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    expect(decision.announce).toBe(true);
    expect(decision.state["stale-prs.yml"]).toBeDefined();
  });

  it("holds the identical finding on the next run", () => {
    const first = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    const second = decideAnnouncement({
      result: seen([overdue()]),
      previous: first.state,
      now: NOW + 5 * 60 * 1000,
    });

    expect(second.announce).toBe(false);
  });

  it("speaks again when the job's state changes under it", () => {
    const first = decideAnnouncement({
      result: seen([overdue({ lastDispatch: null })]),
      previous: {},
      now: NOW,
    });

    // GitHub started dispatching again, and now the job itself is failing.
    // That is a different problem with a different remedy, so it is not the
    // same finding and must not be held (L11).
    const second = decideAnnouncement({
      result: seen([
        overdue({
          lastDispatch: {
            conclusion: "failure",
            at: new Date(NOW).toISOString(),
            ranAnySteps: true,
            refusal: null,
          },
        }),
      ]),
      previous: first.state,
      now: NOW + HOUR,
    });

    expect(second.announce).toBe(true);
  });

  /**
   * A suppression that cannot expire is the defect (L523). The floor comes
   * from the job's OWN interval rather than a constant, so a weekly job is
   * re-reported weekly and a daily one daily, derived from the same number the
   * overdue verdict uses (L401). It can never become permanent, because the
   * window always passes.
   */
  it("speaks again once the job's own window has passed with no fix", () => {
    const first = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    const justBefore = decideAnnouncement({
      result: seen([overdue()]),
      previous: first.state,
      now: NOW + WEEK - HOUR,
    });
    expect(justBefore.announce).toBe(false);

    const justAfter = decideAnnouncement({
      result: seen([overdue()]),
      previous: first.state,
      now: NOW + WEEK + HOUR,
    });
    expect(justAfter.announce).toBe(true);
  });

  it("forgets a job that recovered, so a relapse is announced", () => {
    const first = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    const healthy = decideAnnouncement({
      result: seen([]),
      previous: first.state,
      now: NOW + HOUR,
    });
    expect(healthy.state["stale-prs.yml"]).toBeUndefined();

    const relapse = decideAnnouncement({
      result: seen([overdue()]),
      previous: healthy.state,
      now: NOW + 2 * HOUR,
    });
    expect(relapse.announce).toBe(true);
  });

  /**
   * Losing the record must never lose the alert. An empty previous state is
   * exactly what a cache miss looks like, and it has to read as "say it",
   * never as "already said".
   */
  it("announces when the record is missing entirely", () => {
    expect(
      decideAnnouncement({
        result: seen([overdue()]),
        previous: {},
        now: NOW,
      }).announce,
    ).toBe(true);
  });

  it("does not hold a second job because a first one was already reported", () => {
    const first = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    const second = decideAnnouncement({
      result: seen([
        overdue(),
        overdue({ name: "Third Party Health", source: "health-checks.yml" }),
      ]),
      previous: first.state,
      now: NOW + HOUR,
    });

    expect(second.announce).toBe(true);
  });

  /**
   * A near budget finding travels in the same message, so it must get the same
   * treatment. Fingerprinting only the overdue list would let a brand new
   * budget warning be swallowed by an unchanged overdue one (L582).
   */
  it("speaks again when a near budget finding appears beside an unchanged one", () => {
    const first = decideAnnouncement({
      result: seen([overdue()]),
      previous: {},
      now: NOW,
    });

    const second = decideAnnouncement({
      result: {
        checked: 2,
        overdue: [overdue()],
        nearBudget: [
          {
            name: "Weekly Digest",
            source: "digest.yml",
            lastDurationMs: 50_000,
            maxDurationMs: 60_000,
          },
        ],
      },
      previous: first.state,
      now: NOW + HOUR,
    });

    expect(second.announce).toBe(true);
  });
});

/**
 * #1078, the wiring. Holding the Slack delivery must not hold the READING or
 * the exit code: the finding is still true, the run log still carries the full
 * report, and the job still goes red. Only the repeated message is held.
 */
describe("runScheduledJobCheck with a record of what was already said", () => {
  const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);

  const silentJob = () => ({
    name: "Stale Pull Requests",
    source: "stale-prs.yml",
    crons: ["0 7 * * 1"],
    lastSuccessAt: new Date(NOW - 40 * DAY).toISOString(),
  });

  function harness(previous: AnnouncedState) {
    const posted: string[] = [];
    const logged: string[] = [];
    let saved: AnnouncedState | null = null;
    return {
      posted,
      logged,
      saved: () => saved,
      run: () =>
        runScheduledJobCheck({
          loadJobs: async () => [silentJob()],
          announceImpl: async ({ title }) => {
            posted.push(title);
          },
          token: "xoxb-test",
          log: (m) => logged.push(m),
          now: NOW,
          readAnnounced: async () => previous,
          writeAnnounced: async (next) => {
            saved = next;
          },
        }),
    };
  }

  it("posts, records it, and exits non zero the first time", async () => {
    const h = harness({});

    expect(await h.run()).toBe(1);
    expect(h.posted).toHaveLength(1);
    expect(h.saved()?.["stale-prs.yml"]).toBeDefined();
  });

  it("holds the Slack post the second time, and still logs and still fails", async () => {
    const first = harness({});
    await first.run();
    const recorded = first.saved();
    expect(recorded).not.toBeNull();

    const second = harness(recorded as AnnouncedState);
    const code = await second.run();

    // The delivery is held. The measurement is not.
    expect(second.posted).toEqual([]);
    expect(second.logged.join("\n")).toContain("Stale Pull Requests");
    expect(code).toBe(1);
  });

  /**
   * A cache miss must never read as "already said". Losing the record costs
   * one duplicate message; treating absence as silence loses the alert.
   */
  it("posts when the record cannot be read at all", async () => {
    const posted: string[] = [];
    const code = await runScheduledJobCheck({
      loadJobs: async () => [silentJob()],
      announceImpl: async ({ title }) => {
        posted.push(title);
      },
      token: "xoxb-test",
      log: () => {},
      now: NOW,
      readAnnounced: async () => {
        throw new Error("cache unavailable");
      },
      writeAnnounced: async () => {},
    });

    expect(posted).toHaveLength(1);
    expect(code).toBe(1);
  });

  /**
   * The watchdog failing to RUN is not a finding about a job, and it has no
   * fingerprint to hold. It must always speak: it is the state in which
   * nothing at all is being watched.
   */
  it("never holds the could not run alert", async () => {
    const posted: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await runScheduledJobCheck({
        loadJobs: async () => {
          throw new Error("GitHub API 502");
        },
        announceImpl: async ({ title }) => {
          posted.push(title);
        },
        token: "xoxb-test",
        log: () => {},
        now: NOW,
        readAnnounced: async () => ({}),
        writeAnnounced: async () => {},
      });
    }

    expect(posted).toHaveLength(2);
  });
});
