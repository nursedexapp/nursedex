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
  decideAnnouncement,
  parseAnnouncedState,
  type ScheduledJob,
  type LastDispatch,
  type OverdueJob,
  type NearBudgetJob,
  type WatchdogResult,
  type AnnouncedState,
  type AnnouncedFinding,
} from "../src/lib/cron/schedule-health";

// Re-exported so every existing caller and test keeps importing from here.
export {
  OVERDUE_FACTOR,
  NEAR_BUDGET_FRACTION,
  expectedIntervalMs,
  evaluateScheduledJobs,
  parseCronSchedules,
  decideAnnouncement,
  parseAnnouncedState,
};
export type {
  ScheduledJob,
  LastDispatch,
  AnnouncedState,
  AnnouncedFinding,
  OverdueJob,
  NearBudgetJob,
  WatchdogResult,
};

/**
 * Which of GitHub's refusals a run that executed no steps carries, classified
 * once from the annotation GitHub put on it (#1138, L35).
 *
 * The two seen so far have different remedies. A failed payment or spending
 * limit is fixed on the account and nowhere else (2026-09-07 to 09-14). A
 * runner GitHub could not acquire is GitHub's own capacity, fixed by nothing
 * anybody here does and usually gone by the next scheduled run (2026-10-05).
 * Anything else is quoted without a remedy, because naming one would be a
 * claim this check never measured (L11).
 */
type RefusalKind = "account" | "capacity" | "unrecognised" | "unstated";

function refusalKind(refusal: string | null): RefusalKind {
  if (!refusal) return "unstated";
  if (/not acquired by Runner/i.test(refusal)) return "capacity";
  if (/payments have failed|spending limit|billing/i.test(refusal))
    return "account";
  return "unrecognised";
}

/**
 * Which dispatch state an overdue job is in, as one sentence, or null when
 * nothing read it (#1041).
 *
 * Three states, three remedies, and the middle and last are the pair the
 * Actions tab cannot tell apart: a refused run and a failed one look identical
 * in every list (L276). On 2026-09-15 Stale Pull Requests was in the third
 * state and the alert described the first two, which cost a reading of the
 * Actions tab, the job JSON and the check run annotations to establish.
 */
function describeDispatch(
  last: LastDispatch | null | undefined,
): string | null {
  if (last === undefined) return null;

  if (last === null) {
    return (
      "Nothing has been dispatched on its schedule at all, so this is the " +
      "schedule having stopped rather than the job failing."
    );
  }

  const when = last.at ? `The run on ${last.at.slice(0, 10)}` : "The last run";

  // Overdue although the last run it dispatched PASSED: the schedule stopped
  // after a good run, which is what GitHub's inactivity disable looks like.
  // There is no failure to read a log for (#1113).
  if (last.conclusion === "success") {
    return (
      `${when} succeeded, and nothing has been dispatched since, so the ` +
      "schedule has stopped firing rather than the job failing. Check whether " +
      "GitHub has disabled the workflow in the Actions tab."
    );
  }

  if (last.ranAnySteps === null) {
    return (
      `${when} was dispatched and did not succeed ` +
      `(${last.conclusion ?? "no conclusion recorded"}), but whether any step ` +
      "ran could not be read, so this is either a broken job or GitHub " +
      "refusing to start it. That run's log tells you which: a refused run " +
      "has none, and its annotations in the Actions tab say whether it was " +
      "the account (billing or a spending limit) or GitHub having no runner " +
      "free."
    );
  }

  if (!last.ranAnySteps) {
    // No steps executed means GitHub refused to start the job. There is no log
    // to read, so the reader must not be sent to one. WHY it refused decides
    // where the remedy is, and only GitHub's own words say why (#1138).
    const kind = refusalKind(last.refusal);
    const quoted = ` GitHub said: "${last.refusal}".`;

    if (kind === "capacity") {
      return (
        `${when} was dispatched, and GitHub found no runner to start the job ` +
        `on before any step ran.${quoted} That is a GitHub capacity problem, ` +
        "not the job and not the account, and the next scheduled run usually " +
        "clears it."
      );
    }
    if (kind === "account") {
      return (
        `${when} was dispatched, and GitHub refused to start the job before ` +
        `any step ran.${quoted} The remedy is on the account, usually billing ` +
        "or a spending limit, and not in the job."
      );
    }
    if (kind === "unrecognised") {
      return (
        `${when} was dispatched, and GitHub refused to start the job before ` +
        `any step ran.${quoted} Nothing in the job ran, so GitHub's reason is ` +
        "the place to start."
      );
    }
    return (
      `${when} was dispatched, and GitHub refused to start the job before any ` +
      "step ran. GitHub gave no reason on the run. The two causes seen so far " +
      "are the account (billing or a spending limit) and GitHub having no " +
      "runner free, and the run's annotations in the Actions tab say which."
    );
  }

  return (
    `${when} was dispatched and its steps executed, and it did not succeed ` +
    `(${last.conclusion ?? "no conclusion recorded"}). The schedule is still ` +
    "firing and the job itself is broken, so read that run's log."
  );
}

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
    const age = job.noSuccessInLastRuns
      ? `has not succeeded in its last ${job.noSuccessInLastRuns} scheduled ` +
        `runs, which go back ${humanize(job.ageMs)}`
      : job.neverRan
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

    // Which of the three states this job is in, when it was read (#1041).
    // Saying it here, on the job's own line, is the difference between a
    // message that names a cause and one that lists possibilities.
    const state = describeDispatch(job.lastDispatch);
    if (state) lines.push(`  ${state}`);
  }

  // The fallback paragraph, and ONLY for jobs whose dispatch state nothing
  // read. A Vercel cron has no runs to look at, so both possibilities are
  // genuinely still open there, and a message may claim only what its check
  // measured (L11). Where the state IS known it is on the job's own line
  // above, and repeating the guesswork underneath would undo the point.
  if (result.overdue.some((job) => job.lastDispatch === undefined)) {
    lines.push(
      "",
      "What is measured is the last SUCCESSFUL run, and for the jobs above " +
        "with no dispatch state named, that is either not being dispatched at " +
        "all or failing every time. The second case is already alerting on its " +
        "own; the first produces no error and no log, which is why this exists. " +
        "GitHub disables a scheduled workflow after 60 days without repository " +
        "activity, and a Vercel cron can stop being dispatched just as quietly. " +
        "Check the Actions tab, or Vercel's cron log.",
    );
  }

  // #1077. This used to end "re-run the job by hand to confirm it still
  // works", which is advice that cannot settle the thing being reported: every
  // entry is queried with event=schedule, deliberately, because a hand run
  // proves the script works and not that GitHub is still firing it. A reader
  // who followed it saw a green run and got the identical alert next time.
  // Suggesting it is still right, saying what it settles is the fix (L36).
  lines.push(
    "",
    "Running one of these by hand is worth doing, because it proves the " +
      "script still works before the next scheduled window. It will not clear " +
      "this alert: only runs GitHub dispatched on the schedule are counted " +
      "here, so what clears it is the job's next scheduled run succeeding.",
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

/**
 * How many scheduled runs are read per workflow, GitHub's maximum page.
 *
 * The most frequent GitHub schedule here is daily, so a page reaches back
 * about three months, far past any interval a job is judged against.
 */
const RUNS_PAGE = 100;

/** The slice of a workflow run this needs. */
interface WorkflowRun {
  id?: number;
  /** What started it. Only "schedule" counts; read from the unfiltered list. */
  event?: string;
  conclusion?: string | null;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
}

/** The slice of GitHub's workflow runs response this needs. */
interface WorkflowRunsResponse {
  workflow_runs?: WorkflowRun[];
}

interface WorkflowResponse {
  created_at?: string;
}

/**
 * The slice of the jobs response that says whether anything actually ran.
 *
 * An EMPTY steps list is the signal: GitHub dispatched the run and refused to
 * start the job (#1041, L276).
 */
interface WorkflowJobsResponse {
  jobs?: Array<{
    id?: number;
    conclusion?: string | null;
    steps?: unknown[];
  }>;
}

/** GitHub's own note on a refused run, quoted into the alert verbatim. */
interface AnnotationResponse {
  message?: string;
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
  /**
   * Where to say what was read, one line per workflow (#1138). Optional, and
   * the CI entry point passes the run log. On 2026-10-07 nothing recorded
   * what GitHub had answered, so the stale list behind a false alert could be
   * inferred afterwards but never shown.
   */
  log?: (message: string) => void;
}

/**
 * Every scheduled workflow, with the timestamp each one is judged against.
 *
 * `event=schedule` throughout, self entry included: a run somebody started by
 * hand proves the job still works, not that GitHub is still firing it, and a
 * schedule GitHub has disabled is precisely what this exists to catch.
 *
 * Every entry is judged on its newest SUCCESSFUL scheduled run EXCEPT this
 * workflow's own, which is judged on its newest dispatch. The reasoning is on
 * ScheduledJob.measuredBy; in short, a watchdog judged on its own success
 * cannot recover from correctly reporting anything.
 *
 * One list per workflow, filtered on `event=schedule` only, with the success
 * picked out of it here. GitHub's combined `event=schedule&status=success`
 * answered from an incomplete index on 2026-09-29, returning a newest success
 * a month old for a job that had passed the day before (#1113, L1014). Reading
 * one list also means the success and the last dispatch come from one answer,
 * so the report can no longer say a run failed while quoting its conclusion
 * as success.
 *
 * That list is a filtered index too, and on 2026-10-07 it was the stale one:
 * its newest run was a refusal from 2026-09-10, for two jobs that had passed
 * their scheduled runs the day before (#1138). So the unfiltered list is read
 * as well, and any scheduled run it holds that is newer than the filtered
 * list's head is put in front of it before anything is judged. A stale index
 * can then make a reading less complete, but it can no longer accuse a job
 * whose newer runs the primary list shows (L119). Runs from that list that
 * GitHub did not dispatch on the schedule are dropped exactly as the filter
 * would drop them.
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
  log,
}: LoadWorkflowJobsOptions): Promise<ScheduledJob[]> {
  const scheduled = collectScheduledWorkflows(files);

  return Promise.all(
    scheduled.map(async (job): Promise<ScheduledJob> => {
      const isSelf = selfSource !== null && job.source === selfSource;

      // The unfiltered list only supplements the filtered one, so a failure to
      // read it costs the cross check and never the reading itself (L371).
      // The filtered list stays required: without it there is nothing to
      // judge, and that failure must surface as the watchdog unable to run.
      const [filteredResponse, fullRead] = await Promise.all([
        api<WorkflowRunsResponse>(
          `/repos/${repo}/actions/workflows/${job.source}/runs?event=schedule&per_page=${RUNS_PAGE}`,
        ),
        api<WorkflowRunsResponse>(
          `/repos/${repo}/actions/workflows/${job.source}/runs?per_page=${RUNS_PAGE}`,
        ).then(
          (response) => ({ ok: true as const, response }),
          (err: unknown) => ({
            ok: false as const,
            reason: err instanceof Error ? err.message : String(err),
          }),
        ),
      ]);
      const filtered = filteredResponse.workflow_runs ?? [];
      const head = filtered[0];
      const fresher = fullRead.ok
        ? (fullRead.response.workflow_runs ?? []).filter(
            (run) =>
              run.event === "schedule" &&
              (!head || runTime(run) > runTime(head)),
          )
        : [];
      const runs = [...fresher, ...filtered];

      log?.(describeRead(job.source, filtered, fresher));
      if (!fullRead.ok) {
        log?.(
          `${job.source}: the full run list could not be read ` +
            `(${fullRead.reason}), so the scheduled list was not cross checked ` +
            "and was judged on its own.",
        );
      }

      const judged = isSelf
        ? runs[0]
        : runs.find((run) => run.conclusion === "success");

      // No success anywhere in a FULL page says only that the last one is
      // older than everything listed, not that there never was one. The
      // oldest listed run is then the most recent it can have been, and the
      // report says which it is (L11).
      const beyondPage = !judged && !isSelf && filtered.length >= RUNS_PAGE;
      const judgedRun = beyondPage ? runs[runs.length - 1] : judged;

      // A workflow with no success on record is judged from when it was
      // created, so adding one does not alert before its first firing.
      const workflow = judgedRun
        ? null
        : await api<WorkflowResponse>(
            `/repos/${repo}/actions/workflows/${job.source}`,
          );

      // The last run on this schedule WHATEVER its conclusion, so the report
      // can name which failure this is (#1041). It is the head of the same
      // list, and two more calls are made only when it did not succeed, so a
      // healthy repository pays two calls per workflow and nothing else.
      const lastDispatch = isSelf
        ? undefined
        : await describeLastDispatch(api, repo, runs[0]);

      return {
        ...job,
        lastSuccessAt: judgedRun?.updated_at ?? judgedRun?.run_started_at ?? null,
        firstSeenAt: workflow?.created_at ?? null,
        measuredBy: isSelf ? "dispatch" : "success",
        lastDispatch,
        // The page that was measured. Runs the full list added in front of a
        // stale page are not a contiguous history, so they do not count (L629).
        ...(beyondPage ? { noSuccessInLastRuns: filtered.length } : {}),
      };
    }),
  );
}

/** When a run was created, for ordering two answers about the same workflow. */
function runTime(run: WorkflowRun): number {
  const at = run.created_at ?? run.run_started_at ?? run.updated_at;
  return at ? Date.parse(at) : Number.NEGATIVE_INFINITY;
}

/** One line for the run log saying what GitHub answered for a workflow. */
function describeRead(
  source: string,
  filtered: WorkflowRun[],
  fresher: WorkflowRun[],
): string {
  const name = (run: WorkflowRun | undefined) =>
    run
      ? `run ${run.id ?? "without an id"} from ${
          run.created_at ?? run.updated_at ?? "an unknown date"
        } (${run.conclusion ?? "no conclusion"})`
      : "no run at all";

  const read = `${source}: GitHub's scheduled run list starts at ${name(filtered[0])}.`;
  if (fresher.length === 0) return read;
  return (
    `${read} The full run list holds ${fresher.length} scheduled ` +
    `run${fresher.length === 1 ? "" : "s"} newer than that, the newest ` +
    `${name(fresher[0])}, and both were judged together.`
  );
}

/**
 * The last run dispatched on a workflow's schedule, whatever it concluded.
 *
 * Read so the alert can say which of three states an overdue job is in, rather
 * than listing two possibilities and choosing neither (#1041).
 *
 * A run whose job executed NO steps is GitHub refusing to start it, which it
 * does for a failed payment or an exhausted spending limit. That refusal is
 * indistinguishable from an ordinary failure in every list (L276), and it is
 * what both scheduled runs of Stale Pull Requests were on 2026-09-07 and
 * 2026-09-14, so the annotation carrying GitHub's reason is quoted into the
 * message.
 *
 * Nothing here may turn a FAILED READ into a finding. Every call past the run
 * list is allowed to fall over without taking the state with it: what is lost
 * then is the detail of whether steps ran, so `ranAnySteps` stays true, which
 * is the reading that sends the reader to the run log. A log that turns out to
 * be empty costs one click; asserting a billing refusal that did not happen
 * sends them to the billing page instead (L11, L93).
 */
async function describeLastDispatch(
  api: <T>(path: string) => Promise<T>,
  repo: string,
  run: WorkflowRun | undefined,
): Promise<LastDispatch | null> {
  if (!run) return null;

  const at = run.updated_at ?? run.run_started_at ?? null;
  const conclusion = run.conclusion ?? null;

  // A run that succeeded is not a failure to explain, and its steps are not
  // worth two more calls.
  // A run that succeeded ran its steps by definition, so that one IS measured.
  if (conclusion === "success") {
    return { conclusion, at, ranAnySteps: true, refusal: null };
  }
  // No id means nothing further can be asked about it, which is not the same
  // as having asked and found steps.
  if (run.id === undefined) {
    return { conclusion, at, ranAnySteps: null, refusal: null };
  }

  let ranAnySteps: boolean | null = null;
  let refusal: string | null = null;
  try {
    const jobs = await api<WorkflowJobsResponse>(
      `/repos/${repo}/actions/runs/${run.id}/jobs`,
    );
    const first = jobs.jobs?.[0];
    if (!first) {
      // The call answered, but with no job in it. Nothing was measured, so
      // this stays null rather than becoming either verdict.
      ranAnySteps = null;
    } else if ((first.steps?.length ?? 0) === 0) {
      ranAnySteps = false;
      try {
        const notes = await api<AnnotationResponse[]>(
          `/repos/${repo}/check-runs/${first.id}/annotations`,
        );
        refusal = notes?.find((n) => n.message)?.message ?? null;
      } catch {
        // The refusal stands without its quote. Saying a job was refused and
        // not why is still the right diagnosis; inventing a reason is not.
        refusal = null;
      }
    } else {
      ranAnySteps = true;
    }
  } catch {
    // Could not read the steps. The run and its conclusion are still known and
    // still worth reporting, but WHY it failed was not measured, so this stays
    // null and the message says so rather than picking the likelier story
    // (L11). An unreadable answer and a measured one are different things.
    ranAnySteps = null;
  }

  return { conclusion, at, ranAnySteps, refusal };
}

/** The alert call, narrowed to what this check needs (see scripts/slack-alert.ts). */
type AnnounceFn = (args: {
  title: string;
  report: string;
  token: string | undefined;
}) => Promise<void>;

export interface WatchdogRunOptions {
  loadJobs: () => Promise<ScheduledJob[]>;
  /**
   * What was already said, so an unchanged finding is not sent again (#1078).
   *
   * Optional, and a caller that omits it announces every time, which is the
   * behaviour before this existed. A read that THROWS is treated the same as
   * no record: the alert goes out. Losing the record must cost a duplicate
   * message and never a silence.
   */
  readAnnounced?: () => Promise<AnnouncedState>;
  /** Where to put the updated record. Failure to save is logged, not fatal. */
  writeAnnounced?: (state: AnnouncedState) => Promise<void>;
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
  readAnnounced,
  writeAnnounced,
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

  // Unconditional, and deliberately ahead of any decision about Slack. What
  // is held below is the DELIVERY of a repeated message, never the reading:
  // the full report is in this run's log whether or not anybody is told again.
  const report = formatWatchdogReport(result);
  log(report);

  // An absent or unreadable record reads as "nothing has been said", so the
  // alert goes out. A lost cache costs one duplicate message; the other way
  // round it would cost the alert, which is the whole point of the job.
  let previous: AnnouncedState = {};
  if (readAnnounced) {
    try {
      previous = await readAnnounced();
    } catch (err: unknown) {
      log(
        `Could not read what was already announced, so this will be sent as ` +
          `new: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const decision = decideAnnouncement({ result, previous, now });

  if (writeAnnounced) {
    await writeAnnounced(decision.state).catch((err: unknown) => {
      // Not fatal, and it fails in the safe direction: the record simply does
      // not advance, so the next run announces rather than staying quiet.
      log(
        `Could not save what was announced: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  if (result.overdue.length > 0) {
    // The exit code does NOT follow the announcement. The finding is still
    // true on a held run, so the job still goes red and the run log still
    // carries the report; what was held is one repeated Slack message.
    if (decision.announce) {
      await alert("Scheduled jobs are not completing", report);
    } else {
      log(
        "Slack was not told again: every finding above is unchanged since it " +
          "was last announced, and none has stood for a whole interval of the " +
          "job it is about (#1078).",
      );
    }
    return 1;
  }

  // A job that is still running but nearly out of time is a different finding
  // with a different remedy, so it does not borrow the wording above (L11).
  if (result.nearBudget.length > 0) {
    if (decision.announce) {
      await alert("A scheduled job is close to its time budget", report);
    } else {
      log("Slack was not told again: the budget finding above is unchanged.");
    }
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
