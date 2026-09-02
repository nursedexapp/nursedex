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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far past its own interval a job may go before it is called overdue.
 *
 * Scheduled runs are not punctual: GitHub delays schedules under load, and a
 * run that starts late still counts. 1.5 leaves half an interval of headroom,
 * which is 12 hours on a daily job and 3.5 days on a weekly one, while still
 * catching a job that has stopped entirely well inside GitHub's 60 day
 * disable window.
 */
export const OVERDUE_FACTOR = 1.5;

/** A window long enough to contain the longest gap any monthly cron produces. */
const SAMPLE_WINDOW_DAYS = 400;
const SAMPLE_START = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Derived intervals, keyed by the schedule they came from. */
const INTERVAL_CACHE = new Map<string, number>();

export interface ScheduledJob {
  /** Display name, as it appears in the Actions tab or in vercel.json. */
  name: string;
  /** Where the job is declared, so the alert says where to go and look. */
  source: string;
  /** The job's own cron expressions. */
  crons: string[];
  /** When it last completed successfully, or null if it never has. */
  lastSuccessAt: string | null;
  /**
   * When this job was first observed, used only when it has never succeeded.
   * A job gets one whole interval from first sight before it is accused, so
   * adding a job does not fire an alert before its first scheduled run.
   */
  firstSeenAt?: string | null;
  /** How long its last successful run took, when the job records that. */
  lastDurationMs?: number | null;
  /** The budget that run had, from the route's own maxDuration export. */
  maxDurationMs?: number | null;
}

export interface OverdueJob {
  name: string;
  source: string;
  ageMs: number;
  intervalMs: number;
  neverRan: boolean;
}

export interface NearBudgetJob {
  name: string;
  source: string;
  lastDurationMs: number;
  maxDurationMs: number;
}

export interface WatchdogResult {
  checked: number;
  overdue: OverdueJob[];
  nearBudget: NearBudgetJob[];
}

/**
 * How much of its budget a run may use before it is worth saying so.
 *
 * These crons send emails one at a time inside a fixed maxDuration, and a run
 * that reaches the ceiling sends a prefix of its batch and returns nothing to
 * say it stopped early (#440). The run before that one is the only warning
 * available.
 */
export const NEAR_BUDGET_FRACTION = 0.8;

/**
 * The cron expressions in a workflow's `on.schedule` block.
 *
 * Commented-out lines are skipped: a schedule somebody turned off is not a
 * schedule, and demanding runs of it would be an alert with no possible remedy.
 */
export function parseCronSchedules(yaml: string): string[] {
  const lines = yaml.split("\n");
  const crons: string[] = [];
  let blockIndent: number | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (blockIndent !== null && indent <= blockIndent && !trimmed.startsWith("-")) {
      blockIndent = null;
    }

    if (trimmed === "schedule:") {
      blockIndent = indent;
      continue;
    }

    if (blockIndent === null) continue;
    if (trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^-\s*cron:\s*["']?([^"'#]+?)["']?\s*$/);
    if (match) crons.push(match[1].trim());
  }

  return crons;
}

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) {
      throw new Error(`Unsupported cron step in "${field}"`);
    }

    let from: number;
    let to: number;
    if (range === "*") {
      from = min;
      to = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      from = a;
      to = b;
    } else {
      from = Number(range);
      to = stepRaw ? max : from;
    }

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new Error(`Unsupported cron field "${field}"`);
    }
    for (let v = from; v <= to; v += step) out.add(v % (max + 1));
  }
  return out;
}

function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Expected a five field cron expression, got "${expression}"`,
    );
  }
  const [min, hour, dom, month, dow] = parts;
  return {
    minutes: parseField(min, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dom, 1, 31),
    months: parseField(month, 1, 12),
    daysOfWeek: parseField(dow, 0, 6),
    domRestricted: dom !== "*",
    dowRestricted: dow !== "*",
  };
}

function matchesDate(fields: CronFields, date: Date): boolean {
  if (!fields.months.has(date.getUTCMonth() + 1)) return false;

  const domHit = fields.daysOfMonth.has(date.getUTCDate());
  const dowHit = fields.daysOfWeek.has(date.getUTCDay());

  // Standard cron: when both day fields are restricted they are ORed, and when
  // only one is, only that one decides.
  if (fields.domRestricted && fields.dowRestricted) return domHit || dowHit;
  if (fields.domRestricted) return domHit;
  if (fields.dowRestricted) return dowHit;
  return true;
}

/**
 * The longest gap between consecutive firings of a job's schedules.
 *
 * Measured by walking a real calendar rather than by reading the expression,
 * so a monthly job is measured against its longest month and a job with two
 * schedules is measured against the union of both.
 */
export function expectedIntervalMs(crons: string[]): number {
  if (crons.length === 0) {
    throw new Error("Cannot derive an interval from no cron expressions");
  }

  // Walking 400 days a minute at a time is the only expensive thing here, and
  // the answer depends on nothing but the expressions, so it is computed once
  // per distinct schedule. Only a successful derivation is cached: a throw must
  // stay a throw on every call.
  const key = crons.join("|");
  const cached = INTERVAL_CACHE.get(key);
  if (cached !== undefined) return cached;

  const fields = crons.map(parseCron);
  const end = SAMPLE_START + SAMPLE_WINDOW_DAYS * DAY_MS;
  let previous: number | null = null;
  let largestGap = 0;
  let fires = 0;

  for (let ts = SAMPLE_START; ts < end; ts += MINUTE_MS) {
    // Cheap arithmetic first: most minutes match no schedule, and building a
    // Date for every minute of 400 days is the only thing here that costs.
    const minuteOfHour = Math.floor(ts / MINUTE_MS) % 60;
    const hourOfDay = Math.floor(ts / HOUR_MS) % 24;

    let hit = false;
    for (const f of fields) {
      if (!f.minutes.has(minuteOfHour) || !f.hours.has(hourOfDay)) continue;
      if (matchesDate(f, new Date(ts))) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    fires++;
    if (previous !== null) largestGap = Math.max(largestGap, ts - previous);
    previous = ts;
  }

  if (fires < 2) {
    throw new Error(
      `Cron expression never fires often enough to derive an interval: ${crons.join(", ")}`,
    );
  }

  INTERVAL_CACHE.set(key, largestGap);
  return largestGap;
}

/**
 * Which jobs have gone quiet for longer than their own schedule allows.
 *
 * Throws when handed nothing, because "no jobs were overdue" and "no jobs were
 * found" have to be told apart, and only one of them is good news.
 */
export function evaluateScheduledJobs({
  jobs,
  now,
}: {
  jobs: ScheduledJob[];
  now: number;
}): WatchdogResult {
  if (jobs.length === 0) {
    throw new Error(
      "The scheduled job watchdog was given nothing to watch. That is a broken " +
        "watchdog, not a healthy repository, so it fails rather than reporting " +
        "an all clear.",
    );
  }

  const overdue: OverdueJob[] = [];
  const nearBudget: NearBudgetJob[] = [];

  for (const job of jobs) {
    const lastDurationMs = job.lastDurationMs ?? null;
    const maxDurationMs = job.maxDurationMs ?? null;
    if (
      lastDurationMs !== null &&
      maxDurationMs !== null &&
      lastDurationMs > maxDurationMs * NEAR_BUDGET_FRACTION
    ) {
      nearBudget.push({
        name: job.name,
        source: job.source,
        lastDurationMs,
        maxDurationMs,
      });
    }

    const intervalMs = expectedIntervalMs(job.crons);
    const limit = intervalMs * OVERDUE_FACTOR;
    const neverRan = !job.lastSuccessAt;

    // A job that has never succeeded is judged from when it was first seen, so
    // a newly added job gets its first scheduled run before anyone is told.
    const since = job.lastSuccessAt ?? job.firstSeenAt ?? null;
    if (!since) {
      overdue.push({
        name: job.name,
        source: job.source,
        ageMs: Number.POSITIVE_INFINITY,
        intervalMs,
        neverRan: true,
      });
      continue;
    }

    // A timestamp that does not parse is NaN, and NaN compares false against
    // every threshold, so an unreadable value would quietly land on the healthy
    // side (L50). It is the watchdog that is broken there, not the job.
    const sinceMs = new Date(since).getTime();
    if (!Number.isFinite(sinceMs)) {
      throw new Error(
        `The last run time for ${job.name} could not be read: "${since}". ` +
          "Nothing can be judged from it, so this fails rather than reporting " +
          "the job as healthy.",
      );
    }

    const ageMs = now - sinceMs;
    if (ageMs > limit) {
      overdue.push({
        name: job.name,
        source: job.source,
        ageMs,
        intervalMs,
        neverRan,
      });
    }
  }

  return { checked: jobs.length, overdue, nearBudget };
}

function humanize(ms: number): string {
  if (!Number.isFinite(ms)) return "ever";
  if (ms >= 2 * DAY_MS) return `${Math.floor(ms / DAY_MS)} days`;
  if (ms >= 2 * HOUR_MS) return `${Math.floor(ms / HOUR_MS)} hours`;
  return `${Math.max(1, Math.floor(ms / MINUTE_MS))} minutes`;
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
    `${result.overdue.length} of ${result.checked} scheduled ${plural} have stopped running.`,
    "",
  ];

  for (const job of result.overdue) {
    const age = job.neverRan
      ? "has never completed successfully"
      : `last succeeded ${humanize(job.ageMs)} ago`;
    lines.push(
      `${job.name} (${job.source}) ${age}, against an expected interval of ${humanize(
        job.intervalMs,
      )}.`,
    );
  }

  lines.push(
    "",
    "A scheduled job that stops firing produces no error and no log, so this " +
      "is the only signal. GitHub disables a scheduled workflow after 60 days " +
      "without repository activity, and a Vercel cron can stop being dispatched " +
      "just as quietly. Check the Actions tab, or Vercel's cron log, and re-run " +
      "the job by hand to confirm it still works.",
  );

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
    await alert("Scheduled jobs have stopped running", report);
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
