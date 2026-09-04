import vercelConfig from "../../../vercel.json";

/**
 * The Vercel crons this deployment schedules, named the way withCronAlerting
 * names them, which is also the key in `job_heartbeats`.
 *
 * One derivation, read by the internal heartbeat route and by the admin job
 * health page. Two copies of this would be two answers to "which jobs should
 * exist", and the page would then reassure somebody about a set of jobs the
 * watchdog was not watching.
 */
export interface ScheduledCron {
  /** The heartbeat key, which is the last path segment. */
  name: string;
  /** The route the platform calls. */
  path: string;
  /** Its cron expressions. One today, a list so a second cannot break this. */
  schedules: string[];
}

export function scheduledCrons(): ScheduledCron[] {
  const crons = vercelConfig.crons ?? [];

  return crons.map((cron) => ({
    name: cron.path.split("/").filter(Boolean).pop() as string,
    path: cron.path,
    schedules: [cron.schedule],
  }));
}

/** Just the names, for callers that only need the set. */
export function scheduledCronNames(): string[] {
  return scheduledCrons().map((cron) => cron.name);
}
