// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cronRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

/**
 * #927. Two kinds of stored data had quietly fallen out of step with reality,
 * and both were found only because somebody went looking: 67 of 134 profiles
 * carried a completeness score below what their profile earns, which decides
 * where a nurse appears in search, and 21 zip codes sat more than three miles
 * from where that zip really is, the worst 41.6 miles, which decides how far
 * away every nurse in them looks.
 *
 * Both checks already existed and reported without changing anything. This is
 * what turns a discovery into a monitor.
 */
const h = vi.hoisted(() => {
  const state = {
    profiles: [] as unknown[],
    zips: [] as unknown[],
    reference: new Map<string, unknown>(),
    profilesThrow: null as Error | null,
    zipsThrow: null as Error | null,
    referenceThrow: null as Error | null,
    slackThrow: null as Error | null,
  };
  const calls = { slack: [] as unknown[] };
  const slackPost = vi.fn(async (_method: string, payload: unknown) => {
    if (h.state.slackThrow) throw h.state.slackThrow;
    h.calls.slack.push(payload);
    return { ok: true };
  });
  const readScoredProfiles = vi.fn(async () => {
    if (h.state.profilesThrow) throw h.state.profilesThrow;
    return h.state.profiles;
  });
  const readAllZips = vi.fn(async () => {
    if (h.state.zipsThrow) throw h.state.zipsThrow;
    return h.state.zips;
  });
  return { state, calls, slackPost, readScoredProfiles, readAllZips };
});

vi.mock("@/lib/data-drift/completeness", async (importOriginal) => ({
  // The RULE stays real. Only the read is stood in for, so a change to what
  // counts as drift still has to pass this file.
  ...(await importOriginal<typeof import("@/lib/data-drift/completeness")>()),
  readScoredProfiles: h.readScoredProfiles,
}));

vi.mock("@/lib/data-drift/zips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-drift/zips")>()),
  readAllZips: h.readAllZips,
  readReference: () => {
    if (h.state.referenceThrow) throw h.state.referenceThrow;
    return h.state.reference;
  },
}));

// The profile read is stood in for above; this only keeps `server-only` out of
// the import graph, which vitest cannot resolve.
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/slack/client", () => ({
  ALERTS_CHANNEL_ID: "C-alerts",
  slackPost: h.slackPost,
}));

vi.mock("@/lib/cron/alerting", () => ({
  // The wrapper's own behaviour (heartbeat, failure alert) is covered where it
  // lives; here it would only hide what the handler answers.
  withCronAlerting: (_name: string, handler: unknown) => handler,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.SUPABASE_SECRET_KEY = "service-role-key";

import { GET } from "./route";

/**
 * An empty profile, whose real score is IN_STEP. Passing that as the stored
 * value makes a row that has not drifted; passing anything else makes one that
 * has, without the fixture having to restate the scoring rules.
 */
const IN_STEP = 10;
const scored = (user_id: string, stored: number) => ({
  user_id,
  profile_completeness: stored,
  photos: [],
  bio: null,
  skills: [],
  care_philosophy: null,
  availability_commitment: [],
  time_slots: [],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  travel_radius_miles: null,
});

/**
 * A reference that is never empty by default. An empty one is refused by the
 * route, and deliberately so, because it would skip every zip and report a
 * clean result having compared nothing; the case that asserts that refusal
 * sets it back to empty itself.
 */
const REFERENCE = () =>
  new Map([["10001", { zip: "10001", latitude: 40.75, longitude: -73.99 }]]);

beforeEach(() => {
  h.state.profiles = [];
  h.state.zips = [];
  h.state.reference = REFERENCE();
  h.state.profilesThrow = null;
  h.state.zipsThrow = null;
  h.state.referenceThrow = null;
  h.state.slackThrow = null;
  h.calls.slack = [];
  h.slackPost.mockClear();
  h.readScoredProfiles.mockClear();
  h.readAllZips.mockClear();
});

describeCronAuthGuard({
  GET,
  // Drift in BOTH checks, so an unguarded route would read, find something and
  // post. Without seeding, a clean run would satisfy the spy assertions below
  // whether or not the guard is there (#629).
  seedSideEffect: () => {
    h.state.profiles = [scored("a", 50)];
    h.state.zips = [{ zip: "10001", latitude: 41.5, longitude: -73.99 }];
  },
  sideEffectSpies: {
    "the profile read": h.readScoredProfiles,
    "the zip read": h.readAllZips,
    "the Slack alert": h.slackPost,
  },
});

describe("the data drift cron", () => {
  it("reports a clean run and says nothing to Slack", async () => {
    h.state.profiles = [scored("a", IN_STEP)];
    h.state.zips = [{ zip: "10001", latitude: 40.75, longitude: -73.99 }];
    h.state.reference = new Map([
      ["10001", { zip: "10001", latitude: 40.75, longitude: -73.99 }],
    ]);

    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      completeness: { examined: 1, drifted: 0 },
      zips: { examined: 1, drifted: 0 },
    });
    expect(h.calls.slack).toHaveLength(0);
  });

  it("alerts when a stored score is not what the profile earns", async () => {
    h.state.profiles = [scored("a", 50), scored("b", IN_STEP)];

    const res = await GET(cronRequest());
    const body = await res.json();

    expect(body.completeness).toMatchObject({ examined: 2, drifted: 1 });
    expect(h.calls.slack).toHaveLength(1);
    expect(JSON.stringify(h.calls.slack[0])).toContain("scored above");
    // The count is out of the listed nurses, not every profile, so the reader
    // is not led to count unfinished signups it was never shown.
    expect(JSON.stringify(h.calls.slack[0])).toContain("1 of 2 listed nurses");
  });

  it("alerts when a zip is far from where that zip really is", async () => {
    h.state.zips = [{ zip: "10001", latitude: 41.5, longitude: -73.99 }];
    h.state.reference = new Map([
      ["10001", { zip: "10001", latitude: 40.75, longitude: -73.99 }],
    ]);

    const res = await GET(cronRequest());
    const body = await res.json();

    expect(body.zips).toMatchObject({ examined: 1, drifted: 1 });
    expect(h.calls.slack).toHaveLength(1);
    expect(JSON.stringify(h.calls.slack[0])).toContain("10001");
  });

  it("still answers 200 when it found drift, so the heartbeat is written", async () => {
    // Found drift and the job being dead are different states and must not
    // share one status field (L53). withCronAlerting writes the heartbeat only
    // on a 2xx, so answering non-2xx here would make the watchdog report this
    // job as having stopped running every week it found something.
    h.state.profiles = [scored("a", 50)];

    const res = await GET(cronRequest());

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("carries both findings in one alert rather than one each", async () => {
    h.state.profiles = [scored("a", 50)];
    h.state.zips = [{ zip: "10001", latitude: 41.5, longitude: -73.99 }];
    h.state.reference = new Map([
      ["10001", { zip: "10001", latitude: 40.75, longitude: -73.99 }],
    ]);

    await GET(cronRequest());

    expect(h.calls.slack).toHaveLength(1);
    const text = JSON.stringify(h.calls.slack[0]);
    expect(text).toContain("scored above");
    expect(text).toContain("10001");
  });

  it("fails the run when a read fell over, rather than reporting no drift", async () => {
    // A failed read is not a clean result. Reporting one would be a watcher
    // saying everything is fine because it could not look (L98), and it has to
    // reach the cron failure alert rather than being answered as success.
    h.state.profilesThrow = new Error("connection reset");

    await expect(GET(cronRequest())).rejects.toThrow(/connection reset/);
  });

  it("fails the run when the reference list cannot be read", async () => {
    // The reference is a file in the repository, so this is what a deployment
    // that did not carry it looks like. Loud rather than a silent clean zip
    // result, which is what an empty reference would produce.
    h.state.referenceThrow = new Error("ENOENT: no such file");

    await expect(GET(cronRequest())).rejects.toThrow(/ENOENT/);
  });

  it("refuses a reference list that arrived empty", async () => {
    // An empty map skips every zip, and zipsNeedingCorrection is right to skip
    // a zip the reference has never heard of, so an empty reference reports a
    // perfectly clean result while comparing nothing at all.
    h.state.zips = [{ zip: "10001", latitude: 41.5, longitude: -73.99 }];
    h.state.reference = new Map();

    await expect(GET(cronRequest())).rejects.toThrow(/reference/i);
  });

  it("reports the finding even when the alert could not be sent", async () => {
    // The Slack bot is not in the alerts channel today (#885), so a send that
    // throws must not turn a run that did its work into a failure, and must
    // not be swallowed either: the counts still reach last_result, which the
    // admin jobs page renders.
    h.state.profiles = [scored("a", 50)];
    h.state.slackThrow = new Error("not_in_channel");

    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.completeness).toMatchObject({ drifted: 1 });
    expect(body.alerted).toBe(false);
  });
});

/**
 * The absence of a run is the other half of what #927 asks for, and it is
 * covered by being listed rather than by a check of its own: the Job Watchdog
 * reads every cron in vercel.json and judges each against its own schedule, so
 * a job that stops firing is reported without anybody remembering to add it to
 * a list. This asserts the listing, which is the part that could be forgotten.
 */
describe("being watched for having stopped", () => {
  it("is a scheduled job the watchdog already knows about", async () => {
    const { scheduledCronNames } = await vi.importActual<
      typeof import("@/lib/cron/vercel-crons")
    >("@/lib/cron/vercel-crons");

    expect(scheduledCronNames()).toContain("data-drift");
  });

  it("runs weekly, which is the cadence drift is worth reporting at", async () => {
    const { readFileSync } = await import("node:fs");
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const mine = config.crons.find((c) => c.path === "/api/cron/data-drift");

    expect(mine?.schedule).toBe("0 6 * * 1");
  });
});
