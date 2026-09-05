/**
 * The dead man's switch for everything in this repo that runs on a schedule
 * (#837, #757).
 *
 * Every scheduled job here already alerts when it FAILS. Nothing noticed when
 * one stopped firing at all, and from outside those are the same thing:
 * silence. GitHub disables a scheduled workflow after 60 days without
 * repository activity, and a Vercel cron that stops being dispatched leaves no
 * log and no error either. L13 asks for both halves: alert on failure, and
 * alert on the absence of an expected run.
 *
 * Two rules shape everything below.
 *
 * The interval each job is judged against is DERIVED from that job's own cron
 * expression. A round number would fire on every normal week of a weekly job
 * and be useless on a quarter-hourly one (L172).
 *
 * Finding nothing to watch is a failure, not an all clear (L98). A watcher that
 * reports success over an empty list is indistinguishable from one that saw
 * everything pass, and an empty list is exactly what a moved directory or a
 * silently failing API call produces.
 */

import {
  OVERDUE_FACTOR,
  NEAR_BUDGET_FRACTION,
  expectedIntervalMs,
  evaluateScheduledJobs,
  humanize,
  parseCronSchedules,
  type ScheduledJob,
  type OverdueJob,
  type NearBudgetJob,
  type WatchdogResult,
} from "../src/lib/cron/schedule-health";

// Re-exported so every existing caller and test keeps importing from here.
export {
  OVERDUE_FACTOR,
  NEAR_BUDGET_FRACTION,
  expectedIntervalMs,
  evaluateScheduledJobs,
  parseCronSchedules,
};
export type { ScheduledJob, OverdueJob, NearBudgetJob, WatchdogResult };

/** The message a person reads, healthy or not. */
export function formatWatchdogReport(result: WatchdogResult): string {
  const plural = result.checked === 1 ? "job" : "jobs";

  const budgetLines = result.nearBudget.map(
    (job) =>
      `${job.name} (${job.source}) took ${Math.round(
        job.lastDurationMs / 1000,
      )}s of its ${Math.round(job.maxDurationMs / 1000)}s budget on its last ` +
      "run. A run that reaches the ceiling stops partway through its batch and " +
      "reports nothing about what it skipped.",
  );

  if (result.overdue.length === 0 && budgetLines.length === 0) {
    return `All ${result.checked} scheduled ${plural} have run within their own interval.`;
  }

  if (result.overdue.length === 0) {
    return [
      `All ${result.checked} scheduled ${plural} are running, but some are close to their time budget.`,
      "",
      ...budgetLines,
    ].join("\n");
  }

  const lines = [
    `${result.overdue.length} of ${result.checked} scheduled ${plural} have not ` +
      "completed successfully within their own interval.",
    "",
  ];

  for (const job of result.overdue) {
    // The wording follows what was actually measured. A line claiming a job
    // has not SUCCEEDED, when what was read is whether it was dispatched at
    // all, sends the reader to look for a failing run that does not exist
    // (L11).
    const dispatch = job.measuredBy === "dispatch";
    const age = job.neverRan
      ? dispatch
        ? "has never been dispatched on its schedule"
        : "has never completed successfully"
      : dispatch
        ? `was last dispatched ${humanize(job.ageMs)} ago`
        : `last succeeded ${humanize(job.ageMs)} ago`;
    lines.push(
      `${job.name} (${job.source}) ${age}, against an expected interval of ${humanize(
        job.intervalMs,
      )}.`,
    );
  }

  lines.push(
    "",
    "What is measured is the last SUCCESSFUL run, so each of these is either " +
      "not being dispatched at all or failing every time. The second case is " +
      "already alerting on its own; the first produces no error and no log, " +
      "which is why this exists. GitHub disables a scheduled workflow after 60 " +
      "days without repository activity, and a Vercel cron can stop being " +
      "dispatched just as quietly. Check the Actions tab, or Vercel's cron log, " +
      "and re-run the job by hand to confirm it still works.",
  );

  // The watchdog's own entry is the exception, and saying so matters: on that
  // line "dispatched" is the whole claim, and the reader should not go hunting
  // for a failing run to explain it.
  if (result.overdue.some((job) => job.measuredBy === "dispatch")) {
    lines.push(
      "",
      "The one line above that says DISPATCHED is the watchdog reading itself, " +
        "and it is judged only on whether its own schedule still fires. A run " +
        "of it that fired and failed already alerts through its own red run, " +
        "so judging itself on success instead would latch it red permanently " +
        "after the first job it correctly reported.",
    );
  }

  if (budgetLines.length > 0) lines.push("", ...budgetLines);

  return lines.join("\n");
}

/**
 * The scheduled workflows, derived from the workflow files themselves.
 *
 * Deriving the watched set rather than listing it by hand is the whole point:
 * a hand-kept registry checks only what it lists, so the workflow somebody adds
 * next month would be exempt from the very check meant to notice it stopped
 * (L41, L96).
 */
export function collectScheduledWorkflows(
  files: Array<{ path: string; contents: string }>,
): Array<{ name: string; source: string; crons: string[] }> {
  const jobs: Array<{ name: string; source: string; crons: string[] }> = [];

  for (const file of files) {
    const crons = parseCronSchedules(file.contents);
    if (crons.length === 0) continue;

    const source = file.path.split("/").pop() ?? file.path;
    const declaredName = file.contents.match(/^name:\s*(.+)$/m)?.[1].trim();
    jobs.push({ name: declaredName || source, source, crons });
  }

  return jobs;
}

/**
 * The workflow file this process is itself running as, or null off CI.
 *
 * The watchdog watches every scheduled workflow in the repository, itself
 * included, and that self entry has to be measured differently (see
 * ScheduledJob.measuredBy). Which file that is comes from GitHub rather than
 * from a constant here: a hardcoded name would go on reading as correct after
 * a rename while silently un-exempting the entry, and the latch would come
 * back with no symptom for two days (L15).
 *
 * Absent inside CI it throws. Falling back to "nothing is self" is the exact
 * shape of the original defect, and it would be invisible: every test still
 * passes, and the only evidence is a permanently red watchdog days later
 * (L289, L93).
 */
export function selfWorkflowSource(
  env: Record<string, string | undefined>,
): string | null {
  const ref = env.GITHUB_WORKFLOW_REF;
  if (ref) return ref.split("@")[0].split("/").pop() ?? null;

  if (env.GITHUB_ACTIONS === "true") {
    throw new Error(
      "GITHUB_WORKFLOW_REF is not set, so the watchdog cannot tell which entry " +
        "is itself. It judges its own entry on whether its schedule fired and " +
        "every other entry on success, and without that it would judge itself " +
        "on success and latch red after the first job it correctly reports.",
    );
  }

  return null;
}

/** The slice of GitHub's workflow runs response this needs. */
interface WorkflowRunsResponse {
  workflow_runs?: Array<{ updated_at?: string; run_started_at?: string }>;
}

interface WorkflowResponse {
  created_at?: string;
}

export interface LoadWorkflowJobsOptions {
  /** owner/name. */
  repo: string;
  /** The workflow files on disk, read by the caller. */
  files: Array<{ path: string; contents: string }>;
  /** A GET against the GitHub API, injected so this is testable without one. */
  api: <T>(path: string) => Promise<T>;
  /** The entry that is this watchdog, from selfWorkflowSource. */
  selfSource: string | null;
}

/**
 * Every scheduled workflow, with the timestamp each one is judged against.
 *
 * `event=schedule` throughout, self entry included: a run somebody started by
 * hand proves the job still works, not that GitHub is still firing it, and a
 * schedule GitHub has disabled is precisely what this exists to catch.
 *
 * `status=success` for every entry EXCEPT this workflow's own. The reasoning
 * is on ScheduledJob.measuredBy; in short, a watchdog judged on its own
 * success cannot recover from correctly reporting anything.
 *
 * A workflow the API cannot answer for throws rather than arriving as "never
 * ran": an unreadable answer and a dead job are different things, and only one
 * of them is fixed by re-enabling a schedule (L11).
 */
export async function loadGitHubWorkflowJobs({
  repo,
  files,
  api,
  selfSource,
}: LoadWorkflowJobsOptions): Promise<ScheduledJob[]> {
  const scheduled = collectScheduledWorkflows(files);

  return Promise.all(
    scheduled.map(async (job): Promise<ScheduledJob> => {
      const isSelf = selfSource !== null && job.source === selfSource;
      const query = isSelf
        ? "?event=schedule&per_page=1"
        : "?event=schedule&status=success&per_page=1";

      const runs = await api<WorkflowRunsResponse>(
        `/repos/${repo}/actions/workflows/${job.source}/runs${query}`,
      );
      const latest = runs.workflow_runs?.[0];

      // A workflow with no scheduled run yet is judged from when it was
      // created, so adding one does not alert before its first firing.
      const workflow = latest
        ? null
        : await api<WorkflowResponse>(
            `/repos/${repo}/actions/workflows/${job.source}`,
          );

      return {
        ...job,
        lastSuccessAt: latest?.updated_at ?? latest?.run_started_at ?? null,
        firstSeenAt: workflow?.created_at ?? null,
        measuredBy: isSelf ? "dispatch" : "success",
      };
    }),
  );
}

/** The alert call, narrowed to what this check needs (see scripts/slack-alert.ts). */
type AnnounceFn = (args: {
  title: string;
  report: string;
  token: string | undefined;
}) => Promise<void>;

export interface WatchdogRunOptions {
  loadJobs: () => Promise<ScheduledJob[]>;
  announceImpl: AnnounceFn;
  token: string | undefined;
  log: (message: string) => void;
  now: number;
}

/**
 * The whole decision the CI entry point makes, in one testable place.
 *
 * Returns an exit code rather than calling process.exit, so all three outcomes
 * can be exercised: every job healthy, a job gone silent, and the watchdog
 * itself unable to read the state. The last of those gets its own wording,
 * because "nobody could tell" and "a job has stopped" send the reader to two
 * different places (L11).
 */
export async function runScheduledJobCheck({
  loadJobs,
  announceImpl,
  token,
  log,
  now,
}: WatchdogRunOptions): Promise<number> {
  const alert = async (title: string, report: string): Promise<void> => {
    await announceImpl({ title, report, token }).catch((err: unknown) => {
      log(
        `Could not post the Slack alert: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  };

  let result: WatchdogResult;
  try {
    result = evaluateScheduledJobs({ jobs: await loadJobs(), now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Scheduled job watchdog could not run: ${message}`);
    await alert(
      "Scheduled job watchdog could not run",
      `${message}\n\nNothing was checked, so this is not an all clear: a job may ` +
        "have stopped running and nobody would know.",
    );
    return 1;
  }

  const report = formatWatchdogReport(result);
  log(report);

  if (result.overdue.length > 0) {
    await alert("Scheduled jobs are not completing", report);
    return 1;
  }

  // A job that is still running but nearly out of time is a different finding
  // with a different remedy, so it does not borrow the wording above (L11).
  if (result.nearBudget.length > 0) {
    await alert("A scheduled job is close to its time budget", report);
    return 1;
  }

  return 0;
}


/**
 * The Vercel crons, derived from vercel.json.
 *
 * The name is the last path segment, which is also the name withCronAlerting
 * writes into job_heartbeats, so the two sides match without a mapping table
 * maintained by hand.
 *
 * A file declaring no crons is a failed read rather than a repository with no
 * scheduled work, and it must not quietly shrink the watched set to nothing
 * (L98).
 */
export function collectVercelCronJobs(
  vercelJson: string,
): Array<{ name: string; source: string; crons: string[] }> {
  const parsed = JSON.parse(vercelJson) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const crons = parsed.crons ?? [];

  if (crons.length === 0) {
    throw new Error(
      "vercel.json declares no crons. The watched set cannot be empty, so this " +
        "is a failed read rather than a repository with no scheduled work.",
    );
  }

  return crons.map((cron) => {
    const path = cron.path ?? "";
    const name = path.split("/").filter(Boolean).pop() ?? path;
    if (!name || !cron.schedule) {
      throw new Error(
        `A cron in vercel.json has no path or no schedule: ${JSON.stringify(cron)}`,
      );
    }
    return { name, source: `vercel.json (${path})`, crons: [cron.schedule] };
  });
}

export interface HeartbeatRow {
  job_name: string;
  first_seen_at?: string | null;
  last_success_at?: string | null;
  last_duration_ms?: number | null;
}

/**
 * Joins the jobs that are SCHEDULED to the rows saying when they last ran.
 *
 * The scheduled side decides who is watched. A row whose job is no longer in
 * vercel.json is a leftover, and reporting on it would name something that
 * cannot run; a job with no row has simply never got through since the table
 * existed, which is a state the evaluation already handles.
 */
export function attachHeartbeats(
  jobs: Array<{ name: string; source: string; crons: string[] }>,
  rows: HeartbeatRow[],
  budgets: Record<string, number | null> = {},
): ScheduledJob[] {
  const byName = new Map(rows.map((row) => [row.job_name, row]));

  return jobs.map((job) => {
    const row = byName.get(job.name);
    return {
      ...job,
      lastSuccessAt: row?.last_success_at ?? null,
      firstSeenAt: row?.first_seen_at ?? null,
      lastDurationMs: row?.last_duration_ms ?? null,
      maxDurationMs: budgets[job.name] ?? null,
    };
  });
}

/** The budget a cron route declares for itself, in seconds. */
export function parseMaxDurationSeconds(source: string): number | null {
  const match = source.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

export interface FetchHeartbeatOptions {
  url: string;
  secret: string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * Reads the cron heartbeats back out of the app.
 *
 * Everything here throws rather than degrading. A read that failed and a job
 * that has stopped are different findings with different remedies, and the
 * watchdog treats a job with no row as one that has never run, so an empty
 * list from a broken read would accuse every cron at once and name the wrong
 * problem entirely (L215, L11).
 */
export async function fetchHeartbeatRows({
  url,
  secret,
  fetchImpl = fetch,
}: FetchHeartbeatOptions): Promise<HeartbeatRow[]> {
  // Refused here rather than by sending an unauthenticated request, whose 401
  // would name the endpoint instead of the missing configuration.
  if (!secret) {
    throw new Error(
      "HEARTBEAT_READ_SECRET is not set, so the cron heartbeats could not be read.",
    );
  }

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `The heartbeat endpoint answered ${response.status} ${response.statusText}` +
        (body ? `: ${body.slice(0, 200)}` : ""),
    );
  }

  const payload = (await response.json()) as { jobs?: HeartbeatRow[] };
  if (!Array.isArray(payload.jobs)) {
    throw new Error(
      "The heartbeat endpoint returned no jobs array, so nothing could be read.",
    );
  }

  return payload.jobs;
}
