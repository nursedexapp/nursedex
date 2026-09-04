import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { scheduledCrons } from "@/lib/cron/vercel-crons";
import { expectedIntervalMs, OVERDUE_FACTOR } from "@/lib/cron/schedule-health";

/**
 * What the admin job health page shows (#888).
 *
 * Every cron already records when it last succeeded in `job_heartbeats`, and
 * the only thing that ever read it was the daily watchdog, which speaks only
 * when something is wrong. Silence from an alerting system means either
 * everything is fine or the alerting is broken, and those look identical from
 * outside. This is the surface that tells them apart.
 *
 * It judges staleness with the SAME rule the watchdog alerts on
 * (`expectedIntervalMs` and `OVERDUE_FACTOR`, both from
 * src/lib/cron/schedule-health.ts). A page with its own threshold would
 * disagree with the watchdog precisely when it matters, and would reassure
 * somebody about a job that is about to page.
 */

export type JobStatus = "ok" | "overdue" | "never-ran";

export interface JobHealthRow {
  name: string;
  path: string;
  /** How often it is meant to run, in ms, derived from its own cron. */
  intervalMs: number;
  /** How long it may go past that before it is called overdue. */
  overdueAfterMs: number;
  lastSuccessAt: string | null;
  /** Null when it has never succeeded, so there is nothing to measure. */
  ageMs: number | null;
  lastDurationMs: number | null;
  lastResult: unknown;
  status: JobStatus;
}

export interface JobHealth {
  rows: JobHealthRow[];
  checkedAt: string;
}

interface HeartbeatRow {
  job_name: string;
  first_seen_at: string | null;
  last_success_at: string | null;
  last_duration_ms: number | null;
  last_result: unknown;
}

/**
 * Reads the heartbeats and pairs them with the crons this deployment
 * schedules.
 *
 * THROWS when the read fails. A failed read that answered with an empty list
 * would render a page saying every job is fine and no jobs exist, which is the
 * most reassuring possible rendering of a broken database connection. The page
 * turns this into its own error state.
 */
export async function getJobHealth(now: Date = new Date()): Promise<JobHealth> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("job_heartbeats")
    .select(
      "job_name, first_seen_at, last_success_at, last_duration_ms, last_result",
    );

  if (error) {
    throw new Error(`Could not read the job heartbeats: ${error.message}`);
  }

  const beats = new Map<string, HeartbeatRow>();
  for (const row of (data ?? []) as HeartbeatRow[]) {
    beats.set(row.job_name, row);
  }

  const nowMs = now.getTime();

  const rows = scheduledCrons().map((cron): JobHealthRow => {
    const beat = beats.get(cron.name) ?? null;
    const intervalMs = expectedIntervalMs(cron.schedules);
    const overdueAfterMs = intervalMs * OVERDUE_FACTOR;

    const lastSuccessAt = beat?.last_success_at ?? null;

    // A job that has never succeeded is judged from when it was first seen,
    // the same way the watchdog does it, so a newly added cron is not shown as
    // a problem before its first scheduled run.
    const since = lastSuccessAt ?? beat?.first_seen_at ?? null;
    const sinceMs = since ? new Date(since).getTime() : Number.NaN;

    let status: JobStatus;
    let ageMs: number | null = null;

    if (!Number.isFinite(sinceMs)) {
      // No row at all, or a timestamp that will not parse. Either way nothing
      // can be judged, and saying "ok" would be an answer this has not earned.
      status = "never-ran";
    } else {
      ageMs = lastSuccessAt ? nowMs - sinceMs : null;
      const overdue = nowMs - sinceMs > overdueAfterMs;
      if (!lastSuccessAt) {
        status = overdue ? "overdue" : "never-ran";
      } else {
        status = overdue ? "overdue" : "ok";
      }
    }

    return {
      name: cron.name,
      path: cron.path,
      intervalMs,
      overdueAfterMs,
      lastSuccessAt,
      ageMs,
      lastDurationMs: beat?.last_duration_ms ?? null,
      lastResult: beat?.last_result ?? null,
      status,
    };
  });

  return { rows, checkedAt: now.toISOString() };
}
