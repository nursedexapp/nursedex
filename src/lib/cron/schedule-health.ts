/**
 * The rules that decide whether a scheduled job is healthy.
 *
 * These used to live in scripts/scheduled-jobs.ts, beside the watchdog that is
 * their oldest reader. They moved here when the admin job health page (#888)
 * became a second reader: a page that answers "is everything running" has to
 * answer it by the same rule the watchdog alerts on, or the two disagree
 * exactly when it matters and the page reassures somebody the watchdog is
 * about to page.
 *
 * Nothing in this module does any IO. Collecting the jobs, fetching their
 * heartbeats and formatting the watchdog's Slack message all stay in
 * scripts/scheduled-jobs.ts, which imports from here.
 *
 * Two rules shape everything below.
 *
 * A job is judged against ITS OWN schedule, derived from its cron expressions
 * rather than assumed, so a weekly job is not accused for missing a day. And a
 * job that has never succeeded is judged from when it was first seen, so
 * adding one does not fire an alert before its first scheduled run.
 */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

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

/**
 * The last run GitHub dispatched on a job's schedule, whatever its conclusion.
 *
 * Read so the report can say WHICH failure an overdue job is in (#1041). What
 * the check is judged on is still the last SUCCESSFUL run; this is read beside
 * it, purely so the message can name a cause rather than list possibilities.
 */
export interface LastDispatch {
  /** GitHub's conclusion for the run: "failure", "cancelled", and so on. */
  conclusion: string | null;
  /** When it finished, for the message. */
  at: string | null;
  /**
   * Whether any step of the job actually executed.
   *
   * False is its own state, and the one that cost a week. GitHub accepted the
   * schedule, dispatched the run, and refused to start the job, which it does
   * for a failed payment or an exhausted spending limit. A refused run is
   * indistinguishable from a failed one in every list (L276), so this is the
   * distinction the Actions tab cannot make for the reader.
   *
   * NULL is a third value and it is load bearing: the read that answers this
   * fell over. It must never collapse into true or false, because the message
   * is built from it and a message may claim only what its check actually
   * measured (L11). Guessing true asserts the steps ran and sends the reader
   * to a log that may not exist; guessing false accuses the billing account of
   * a refusal nothing observed.
   */
  ranAnySteps: boolean | null;
  /**
   * GitHub's own annotation on a refused run, quoted verbatim into the alert.
   *
   * Quoted rather than paraphrased because the remedy lives in the sentence:
   * it names billing or a spending limit, which is nowhere near the job and is
   * the last place a reader sent to "check the Actions tab" would look.
   */
  refusal: string | null;
}

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
   * Which question lastSuccessAt answers.
   *
   * "success" for everything, and "dispatch" for the one entry that is the
   * watchdog itself. A watchdog judged on its own success latches: its first
   * correct failure about some other job stops its own success clock, so the
   * next run finds itself overdue, fails for that reason, and pushes the clock
   * a further interval out, forever, with the original problem long fixed
   * (#1039). What only it can detect about itself is its schedule no longer
   * firing; a run that fired and failed is already alerting through its own
   * red run. The wording of every message follows this field, because a
   * message may claim only what its check measured (L11).
   */
  measuredBy?: "success" | "dispatch";
  /**
   * When this job was first observed, used only when it has never succeeded.
   * A job gets one whole interval from first sight before it is accused, so
   * adding a job does not fire an alert before its first scheduled run.
   */
  firstSeenAt?: string | null;
  /**
   * The last run dispatched on its schedule, whatever its conclusion (#1041).
   *
   * Three values, three meanings, and the difference between the last two is
   * the whole point (L11). `undefined` means nothing looked, which is the
   * honest state for a Vercel cron, where there are no runs to read; the
   * report falls back to naming both possibilities there. `null` means it
   * looked and GitHub has dispatched nothing on this schedule. An object means
   * it looked and found a run.
   */
  lastDispatch?: LastDispatch | null;
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
  /** Carried through from the job, so the report can say what it measured. */
  measuredBy: "success" | "dispatch";
  /** Carried through so the report can name which failure this is (#1041). */
  lastDispatch?: LastDispatch | null;
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
        measuredBy: job.measuredBy ?? "success",
        lastDispatch: job.lastDispatch,
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
        measuredBy: job.measuredBy ?? "success",
        lastDispatch: job.lastDispatch,
      });
    }
  }

  return { checked: jobs.length, overdue, nearBudget };
}

export function humanize(ms: number): string {
  if (!Number.isFinite(ms)) return "ever";
  if (ms >= 2 * DAY_MS) return `${Math.floor(ms / DAY_MS)} days`;
  if (ms >= 2 * HOUR_MS) return `${Math.floor(ms / HOUR_MS)} hours`;
  return `${Math.max(1, Math.floor(ms / MINUTE_MS))} minutes`;
}
