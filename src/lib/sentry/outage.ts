import { HOUR_MS, MINUTE_MS, humanize } from "@/lib/cron/schedule-health";

/**
 * Who hears about a Sentry outage, and when.
 *
 * sentry-alerts runs every 15 minutes, and on 2026-10-20 a Sentry outage paged
 * the channel on every run, each page reading like a fault of ours. Now the
 * first failed run pages, saying it is Sentry; later failed runs stay quiet; a
 * long outage gets a reminder every two hours; and the first run that gets
 * through again says so.
 *
 * The only state this needs is the job's own heartbeat (last_success_at), which
 * the cron wrapper already writes on every successful run. If the run before
 * this one got through, this failure is the start of an outage. That keeps the
 * whole decision in one pure function with no table of its own.
 *
 * `lastSuccessAt` is undefined when the heartbeat could not be read and null
 * when the job has never got through. Both page: a failure that cannot be
 * placed in an outage must not be hidden on the guess that it was announced.
 */

/** From vercel.json: the sentry-alerts schedule is every 15 minutes. */
export const RUN_INTERVAL_MS = 15 * MINUTE_MS;

/**
 * How long since the last success still counts as "the run before this one got
 * through". One interval plus slack for a run that fired a little late; a single
 * missed run (30 minutes) is past it.
 */
const PREVIOUS_RUN_WINDOW_MS = RUN_INTERVAL_MS + 10 * MINUTE_MS;

export const REMINDER_EVERY_MS = 2 * HOUR_MS;

const STATUS_PAGE = "https://status.sentry.io";

type LastSuccess = Date | null | undefined;

export type OutageAlert = "first" | "reminder" | "quiet";

export function planOutageAlert({
  lastSuccessAt,
  now,
}: {
  lastSuccessAt: LastSuccess;
  now: Date;
}): OutageAlert {
  if (!lastSuccessAt) return "first";
  const down = now.getTime() - lastSuccessAt.getTime();
  if (down < PREVIOUS_RUN_WINDOW_MS) return "first";
  // A reminder on the one run that crosses each two hour mark.
  const crossed =
    Math.floor(down / REMINDER_EVERY_MS) >
    Math.floor((down - RUN_INTERVAL_MS) / REMINDER_EVERY_MS);
  return down >= REMINDER_EVERY_MS && crossed ? "reminder" : "quiet";
}

export function outageMessage({
  kind,
  status,
  lastSuccessAt,
  now,
}: {
  kind: Exclude<OutageAlert, "quiet">;
  status: number | null;
  lastSuccessAt: LastSuccess;
  now: Date;
}): string {
  const answer = status === null ? "no answer" : String(status);
  if (kind === "reminder" && lastSuccessAt) {
    const down = humanize(now.getTime() - lastSuccessAt.getTime());
    return (
      `Sentry is still down (${answer}): \`sentry-alerts\` has not got through for ${down}.\n` +
      `Nothing is lost: the first run after Sentry recovers catches up on everything. Status: ${STATUS_PAGE}`
    );
  }
  return (
    `Sentry is down (${answer}), so \`sentry-alerts\` cannot check for new issues.\n` +
    `Nothing is lost: the first run after Sentry recovers catches up on everything. Status: ${STATUS_PAGE}\n` +
    `Later failed runs stay quiet. A message follows when it is back, or a reminder if it is still down in 2 hours.`
  );
}

/**
 * Null unless at least one run failed since the last success. Worded for any
 * gap, not only a Sentry outage, since the heartbeat cannot tell them apart and
 * a job getting through again after any failure is worth one line.
 */
export function recoveryMessage({
  lastSuccessAt,
  now,
}: {
  lastSuccessAt: LastSuccess;
  now: Date;
}): string | null {
  if (!lastSuccessAt) return null;
  const gap = now.getTime() - lastSuccessAt.getTime();
  if (gap < PREVIOUS_RUN_WINDOW_MS) return null;
  return `\`sentry-alerts\` is working again after ${humanize(gap)} without a successful run, and has caught up.`;
}
