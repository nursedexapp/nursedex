import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

/**
 * The mark a cron leaves when it succeeds (#757).
 *
 * withCronAlerting already makes a FAILING cron loud. A cron that stops being
 * dispatched at all is silent: no error, no log, no alert, indistinguishable
 * from a healthy system with nothing to report. L13 asks for both halves, and
 * this is the second: one row per job saying when it last got through, so
 * something outside the platform can notice when that stops advancing.
 *
 * Deliberately one row per job rather than a run log. The question anybody
 * asks is "when did this last run", the table answers it directly, and it
 * cannot grow without bound.
 */

/** How much of a run's own result is worth keeping on the row. */
export const MAX_RESULT_CHARS = 2000;

export interface HeartbeatArgs {
  jobName: string;
  durationMs: number;
  /** Whatever the route returned, kept so a truncated batch is visible (#440). */
  result: unknown;
  now: Date;
}

/**
 * An oversized result is replaced rather than dropped: a row that silently
 * lost its result and one whose job reported nothing look identical (L11).
 */
function fitResult(result: unknown): unknown {
  if (result === null || result === undefined) return null;

  let serialized: string;
  try {
    serialized = JSON.stringify(result) ?? "null";
  } catch {
    return { note: "the run's result could not be serialized" };
  }

  if (serialized.length <= MAX_RESULT_CHARS) return result;
  return {
    note: `the run's result was too large to keep (${serialized.length} characters)`,
  };
}

/**
 * Records a successful run.
 *
 * Never throws. The heartbeat is bookkeeping ABOUT the run, not the run, so a
 * failed write must not turn a cron that did its work into a 500: on a dunning
 * job that would fire the failure alert and read as enforcement breaking.
 *
 * Quiet is not the same as swallowed. A failed write goes to Sentry, because a
 * heartbeat that has silently stopped being written would make every job look
 * dead to the watchdog at once, and the cause has to be visible.
 */
export async function recordCronHeartbeat(
  supabase: SupabaseClient,
  { jobName, durationMs, result, now }: HeartbeatArgs,
): Promise<void> {
  try {
    // first_seen_at is deliberately absent: the column default sets it on the
    // first insert, and it has to survive every later run because it is what
    // gives a job that has never succeeded its grace period.
    const { error } = await supabase.from("job_heartbeats").upsert(
      {
        job_name: jobName,
        last_success_at: now.toISOString(),
        last_duration_ms: durationMs,
        last_result: fitResult(result),
        updated_at: now.toISOString(),
      },
      { onConflict: "job_name" },
    );

    if (error) {
      throw new Error(
        `job_heartbeats upsert failed for ${jobName}: ${error.message}`,
      );
    }
  } catch (err: unknown) {
    console.error(`[cron ${jobName}] heartbeat write failed:`, err);
    Sentry.captureException(
      err instanceof Error ? err : new Error(String(err)),
      { tags: { action: "cron_heartbeat", job: jobName } },
    );
  }
}
