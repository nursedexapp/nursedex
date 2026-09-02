// @vitest-environment node
//
// The record every cron leaves behind when it succeeds (#757).
//
// A cron that FAILS is loud: withCronAlerting posts to Slack and Sentry. A
// cron that stops being dispatched at all produces no error, no log and no
// alert, and reads exactly like a healthy system with nothing to report. The
// only way to tell those apart from outside is a mark left by every run that
// did happen, and its absence.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: h.captureException,
}));

import { recordCronHeartbeat, MAX_RESULT_CHARS } from "./heartbeat";

type UpsertArgs = { payload: Record<string, unknown>; options: unknown };

function fakeSupabase(error: { message: string } | null = null) {
  const calls: Array<{ table: string } & UpsertArgs> = [];
  const client = {
    from(table: string) {
      return {
        upsert(payload: Record<string, unknown>, options: unknown) {
          calls.push({ table, payload, options });
          return Promise.resolve({ error });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordCronHeartbeat", () => {
  it("writes the job's name and the moment it succeeded", async () => {
    const { client, calls } = fakeSupabase();
    const at = new Date("2026-09-01T05:00:00Z");

    await recordCronHeartbeat(client, {
      jobName: "access-expiry",
      durationMs: 1200,
      result: { success: true, sent: 3 },
      now: at,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("job_heartbeats");
    expect(calls[0].payload).toMatchObject({
      job_name: "access-expiry",
      last_success_at: at.toISOString(),
      last_duration_ms: 1200,
    });
  });

  /**
   * Upserting on the job name rather than inserting: one row per job, so the
   * table answers "when did this last run" directly instead of growing a log
   * somebody would have to aggregate, and so it cannot grow without bound.
   */
  it("upserts on the job name, so each job keeps one row", async () => {
    const { client, calls } = fakeSupabase();

    await recordCronHeartbeat(client, {
      jobName: "access-expiry",
      durationMs: 5,
      result: null,
      now: new Date(),
    });

    expect(calls[0].options).toMatchObject({ onConflict: "job_name" });
  });

  /**
   * first_seen_at is left out of the payload on purpose. It is set by the
   * column default on the first insert and must survive every later run,
   * because it is what gives a job that has never succeeded its grace period.
   */
  it("never writes first_seen_at, so the first sighting survives", async () => {
    const { client, calls } = fakeSupabase();

    await recordCronHeartbeat(client, {
      jobName: "access-expiry",
      durationMs: 5,
      result: null,
      now: new Date(),
    });

    expect(calls[0].payload).not.toHaveProperty("first_seen_at");
  });

  /**
   * #440: a cron that runs out of time sends a prefix of its batch and returns
   * nothing to say so. Keeping what the run reported means a truncated run is
   * visible afterwards, rather than being reconstructed from Vercel's logs.
   */
  it("keeps what the run reported, so a short batch is visible later", async () => {
    const { client, calls } = fakeSupabase();

    await recordCronHeartbeat(client, {
      jobName: "renewal-reminder",
      durationMs: 900,
      result: { success: true, sent: 12, skipped: 4 },
      now: new Date(),
    });

    expect(calls[0].payload.last_result).toMatchObject({ sent: 12, skipped: 4 });
  });

  it("stores a note instead of an oversized result, rather than a failed write", async () => {
    const { client, calls } = fakeSupabase();

    await recordCronHeartbeat(client, {
      jobName: "sla-alerts",
      durationMs: 10,
      result: { blob: "x".repeat(MAX_RESULT_CHARS * 2) },
      now: new Date(),
    });

    expect(JSON.stringify(calls[0].payload.last_result).length).toBeLessThan(
      MAX_RESULT_CHARS + 200,
    );
    expect(JSON.stringify(calls[0].payload.last_result)).toMatch(/too large/i);
  });

  /**
   * The heartbeat is bookkeeping about the run, not the run. A failure to
   * write it must not turn a cron that did its work into a 500, which would
   * fire the failure alert and, on a dunning job, look like enforcement broke.
   *
   * Quiet is not the same as swallowed: it goes to Sentry, so a heartbeat that
   * has silently stopped being written is itself visible (L13).
   */
  it("reports a failed write to Sentry and does not throw", async () => {
    const { client } = fakeSupabase({ message: "permission denied" });

    await expect(
      recordCronHeartbeat(client, {
        jobName: "access-expiry",
        durationMs: 5,
        result: null,
        now: new Date(),
      }),
    ).resolves.toBeUndefined();

    expect(h.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ job: "access-expiry" }),
      }),
    );
  });

  it("reports a thrown write the same way", async () => {
    const client = {
      from() {
        return {
          upsert() {
            return Promise.reject(new Error("network down"));
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      recordCronHeartbeat(client, {
        jobName: "access-expiry",
        durationMs: 5,
        result: null,
        now: new Date(),
      }),
    ).resolves.toBeUndefined();

    expect(h.captureException).toHaveBeenCalled();
  });
});
