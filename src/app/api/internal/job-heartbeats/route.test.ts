// @vitest-environment node
//
// The one way the heartbeats leave the database (#757).
//
// The watchdog that reads these runs in GitHub Actions, outside Vercel, on
// purpose: a check that runs on the same scheduler as the jobs it watches dies
// with them. That means something has to hand the rows out over HTTP, and this
// is it.
//
// It is scoped to its own secret rather than reusing CRON_SECRET or
// ADMIN_SECRET. Both of those can DO things (run every cron, reach every admin
// route), and this reader needs to do nothing but read thirteen timestamps.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  inserted: [] as string[],
  insertError: null as { message: string } | null,
  upsertOptions: null as unknown,
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: h.rows, error: h.error }),
      // Upsert rather than insert: two watchdog reads can overlap, and the
      // second must not fail on a row the first just created.
      upsert: (payload: Array<{ job_name: string }>, options: unknown) => {
        h.upsertOptions = options;
        h.inserted.push(...payload.map((row) => row.job_name));
        return Promise.resolve({ error: h.insertError });
      },
    }),
  }),
}));

import { GET } from "./route";

function request(auth?: string): NextRequest {
  return {
    headers: { get: (name: string) => (name === "authorization" ? (auth ?? null) : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  h.rows = [
    {
      job_name: "access-expiry",
      first_seen_at: "2026-08-01T00:00:00Z",
      last_success_at: "2026-09-01T05:00:12Z",
      last_duration_ms: 1400,
      last_result: { success: true, sent: 2 },
    },
  ];
  h.error = null;
  h.inserted = [];
  h.insertError = null;
  process.env.HEARTBEAT_READ_SECRET = "test-heartbeat-secret";
});

describe("GET /api/internal/job-heartbeats", () => {
  it("refuses a caller with no credential", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("refuses a caller with the wrong credential", async () => {
    const res = await GET(request("Bearer not-the-secret"));
    expect(res.status).toBe(401);
  });

  /**
   * Fails closed when the secret is unset, rather than comparing against
   * "Bearer undefined" which any caller could send. The shared helper does
   * this; the test is here because this route is the reason it matters.
   */
  it("refuses everyone when the secret is not configured", async () => {
    delete process.env.HEARTBEAT_READ_SECRET;
    const res = await GET(request("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("returns the heartbeat rows to an authorised caller", async () => {
    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jobs: Array<{ job_name: string; last_success_at: string | null }>;
    };
    // Found by name rather than by position: the answer also carries a row for
    // every other scheduled cron, registered on the way past.
    const row = body.jobs.find((j) => j.job_name === "access-expiry");
    expect(row?.last_success_at).toBe("2026-09-01T05:00:12Z");
  });

  /**
   * A read that failed must not answer 200 with an empty list. The watchdog
   * treats a job with no row as one that has never run, so an empty list from a
   * broken query would accuse all thirteen jobs at once, and the alert would
   * name the wrong problem entirely (L215, L11).
   */
  it("answers with an error when the query fails, never with an empty list", async () => {
    h.error = { message: "permission denied for table job_heartbeats" };
    h.rows = [];

    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/heartbeat/i);
  });

  /**
   * A table with nothing in it is a real state: it is what the deploy before
   * the first cron run looks like. It has to stay distinguishable from the
   * failure above, so it answers 200 with a row per scheduled job and no
   * successes on any of them, never an error.
   */
  it("answers 200 with jobs that have never succeeded when nothing has run yet", async () => {
    h.rows = [];

    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jobs: Array<{ last_success_at: string | null }>;
    };
    expect(body.jobs.length).toBeGreaterThan(0);
    expect(body.jobs.every((j) => j.last_success_at === null)).toBe(true);
  });

  /**
   * The grace period a job gets before it is called overdue is measured from
   * when it was FIRST SEEN, and that lives on its row. A cron with no row at
   * all therefore gets no grace: the watchdog reports it as never having
   * completed the moment it is added, and keeps saying so until its first run,
   * which for the monthly invoice job is up to a month of daily false alerts.
   *
   * So the first read after a cron is added records that it exists. The names
   * come from vercel.json on the server, never from the caller, so this cannot
   * be used to create rows for anything that is not actually scheduled.
   */
  it("records a scheduled cron that has no row yet", async () => {
    h.rows = [];

    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(200);
    expect(h.inserted.length).toBeGreaterThan(0);
    expect(h.inserted).toContain("access-expiry");
  });

  // Two runs can overlap, so the write has to tolerate a row that appeared
  // between the read and the write rather than failing on it.
  it("tolerates the row already existing when it writes", async () => {
    h.rows = [];

    await GET(request("Bearer test-heartbeat-secret"));

    expect(h.upsertOptions).toMatchObject({
      onConflict: "job_name",
      ignoreDuplicates: true,
    });
  });

  it("records nothing when every scheduled cron already has a row", async () => {
    const { crons } = (await import("../../../../../vercel.json")) as unknown as {
      crons: Array<{ path: string }>;
    };
    h.rows = crons.map((c) => ({
      job_name: c.path.split("/").filter(Boolean).pop(),
      first_seen_at: "2026-08-01T00:00:00Z",
      last_success_at: null,
      last_duration_ms: null,
      last_result: null,
    }));

    await GET(request("Bearer test-heartbeat-secret"));

    expect(h.inserted).toEqual([]);
  });

  it("returns the new rows in the same answer, not on the next call", async () => {
    h.rows = [];

    const res = await GET(request("Bearer test-heartbeat-secret"));
    const body = (await res.json()) as { jobs: Array<{ job_name: string }> };

    // A caller that had to ask twice would judge the first answer against an
    // empty table, which is the state this exists to stop it seeing.
    expect(body.jobs.length).toBe(h.inserted.length);
  });

  /**
   * The read is what the caller asked for. If the bookkeeping write fails, the
   * rows that DO exist still have to come back: refusing them would turn a
   * failure to register a new job into a total blackout of every job that is
   * running fine.
   */
  it("still answers with the rows it has when the registration write fails", async () => {
    h.rows = [{ job_name: "access-expiry", last_success_at: "2026-09-01T05:00:00Z" }];
    h.insertError = { message: "permission denied" };

    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[] };
    expect(body.jobs.length).toBeGreaterThan(0);
  });
});
