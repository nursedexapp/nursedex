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
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: h.rows, error: h.error }),
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
    const body = (await res.json()) as { jobs: Array<{ job_name: string }> };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].job_name).toBe("access-expiry");
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
   * An empty table is a real state: it is what the deploy before the first cron
   * run looks like. It has to be distinguishable from the failure above.
   */
  it("returns an empty list, and a 200, when nothing has run yet", async () => {
    h.rows = [];

    const res = await GET(request("Bearer test-heartbeat-secret"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[] };
    expect(body.jobs).toEqual([]);
  });
});
