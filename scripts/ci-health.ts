// How often two "tolerable" CI outcomes actually happen (#818).
//
// A Playwright flake and a merged tree proof that could not be evaluated are
// both classified as fine: the run goes green either way. But the code waving
// them through has no notion of volume, so one blip and a permanently broken
// lookup arrive on the same path and are indistinguishable, which leaves the
// second invisible for exactly as long as it lasts (L77).
//
// The merged tree proof shipped in exactly that state: a 403 meant it never
// once held, every merge paid the full run, and nothing anywhere went red.

/** What one run reported for a signal, or null if it reported nothing. */
export type RunOutcome = {
  runId: number;
  value: string | null;
};

export type RateOptions = {
  /** Whether a reported value counts as the bad outcome. */
  isBad: (value: string) => boolean;
  /** The share of reporting runs allowed to be bad, 0 to 1. */
  threshold: number;
  /** Below this many reporting runs, refuse to judge rather than guess. */
  minimumRuns?: number;
};

export type RateResult = {
  verdict: "ok" | "over" | "insufficient";
  /** Runs that reported this signal at all. */
  reporting: number;
  /** Runs that reported nothing, which is a fact about the instrument. */
  silent: number;
  bad: number;
  rate: number;
  badRunIds: number[];
  message: string;
};

export function rateOf(
  runs: readonly RunOutcome[],
  options: RateOptions,
): RateResult {
  const { isBad, threshold, minimumRuns = 1 } = options;

  if (!(threshold >= 0) || threshold > 1) {
    throw new Error(
      `threshold must be between 0 and 1, got ${threshold}. A threshold above ` +
        `1 can never be exceeded, which is a check that cannot fire.`,
    );
  }

  // A run that reported nothing is NOT a healthy run. Counting it as one reads
  // every run from before the instrument existed as clean, and reports a rate
  // far below the real one (L223, L98). Both signals now announce themselves
  // on every run precisely so this distinction exists.
  const reported = runs.filter((run) => run.value !== null);
  const silent = runs.length - reported.length;
  const bad = reported.filter((run) => isBad(run.value as string));
  const rate = reported.length === 0 ? 0 : bad.length / reported.length;

  const silence =
    silent === 0
      ? ""
      : ` ${silent} run${silent === 1 ? "" : "s"} did not report at all (silent), ` +
        `which is a fact about the instrument rather than about the runs.`;

  // A proportion over almost nothing is noise: it cannot tell one bad out of
  // two from twelve out of twelve (L139). Refusing must not read as healthy.
  if (reported.length < minimumRuns) {
    return {
      verdict: "insufficient",
      reporting: reported.length,
      silent,
      bad: bad.length,
      rate,
      badRunIds: bad.map((run) => run.runId),
      message:
        `Only ${reported.length} run${reported.length === 1 ? "" : "s"} ` +
        `reported, fewer than the ${minimumRuns} needed to read a rate from. ` +
        `Not judged, which is not the same as healthy.${silence}`,
    };
  }

  const asPercent = `${Math.round(rate * 100)}%`;
  const allowed = `${Math.round(threshold * 100)}%`;

  if (rate > threshold) {
    return {
      verdict: "over",
      reporting: reported.length,
      silent,
      bad: bad.length,
      rate,
      badRunIds: bad.map((run) => run.runId),
      message:
        `${bad.length} of ${reported.length} reporting runs (${asPercent}) ` +
        `were bad, past the ${allowed} allowed.${silence}`,
    };
  }

  return {
    verdict: "ok",
    reporting: reported.length,
    silent,
    bad: bad.length,
    rate,
    badRunIds: bad.map((run) => run.runId),
    message:
      `${bad.length} of ${reported.length} reporting runs (${asPercent}), ` +
      `within the ${allowed} allowed.${silence}`,
  };
}

/* ------------------------------------------------------- reading the runs */

/** Fetches a REST path and returns parsed JSON, or throws. */
export type Api = (path: string) => Promise<unknown>;

/**
 * The message of the annotation titled `title` on any job of `runId`, or null
 * when no job carries one.
 *
 * Null means the run did not report. It must never be conflated with a healthy
 * run: both signals emit their annotation unconditionally so that this
 * distinction exists at all (L223).
 */
export async function findAnnotation(
  api: Api,
  repo: string,
  runId: number,
  title: string,
): Promise<string | null> {
  const jobs = (await api(
    `/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`,
  )) as { jobs: Array<{ id: number }> };

  for (const job of jobs.jobs) {
    const annotations = (await api(
      `/repos/${repo}/check-runs/${job.id}/annotations`,
    )) as Array<{ title: string | null; message: string }>;
    const hit = annotations.find((a) => a.title === title);
    if (hit) return hit.message;
  }
  return null;
}

/** What each of the most recent completed runs of `workflow` reported. */
export async function collectOutcomes(
  api: Api,
  repo: string,
  workflow: string,
  title: string,
  limit: number,
): Promise<RunOutcome[]> {
  const runs = (await api(
    `/repos/${repo}/actions/workflows/${workflow}/runs?status=completed&per_page=${limit}`,
  )) as { workflow_runs: Array<{ id: number }> };

  const outcomes: RunOutcome[] = [];
  for (const run of runs.workflow_runs) {
    outcomes.push({ runId: run.id, value: await findAnnotation(api, repo, run.id, title) });
  }
  return outcomes;
}

/**
 * Whether a flake annotation describes a run that flaked.
 *
 * An unparseable message counts as BAD, not as clean: a change to the
 * reporter's wording would otherwise silently zero the rate, and a rate that
 * quietly becomes zero is the exact failure this whole issue is about (L50).
 */
export function flakedInRun(message: string): boolean {
  const count = Number(message.match(/FLAKY_COUNT=(\d+)/)?.[1] ?? Number.NaN);
  return !Number.isFinite(count) || count > 0;
}

/**
 * Whether a proof annotation describes a run where the proof could not be
 * evaluated. `held` and `refused` are both fine: refusing is the proof working.
 * Anything else, including an unrecognised message, counts as unavailable.
 */
export function proofWasUnavailable(message: string): boolean {
  return !/OUTCOME=(held|refused)\b/.test(message);
}


/* ----------------------------------------------------------- the verdict */

export type NamedRate = { name: string; result: RateResult };

/**
 * Whether the job should fail.
 *
 * Only "over" fails. "Not judged" must NOT: it is an honest refusal when there
 * is too little data, and failing on it would make this red every time the repo
 * goes quiet for a week, which is how a check trains everyone to ignore it
 * (L36). A check that cries wolf gets ignored, and this one is watching for
 * something that is already invisible.
 */
export function shouldFail(rates: readonly NamedRate[]): boolean {
  return rates.some((rate) => rate.result.verdict === "over");
}

/** The step summary for one signal. */
export function formatRate(rate: NamedRate, repo: string): string {
  const mark = {
    ok: "within budget",
    over: "OVER BUDGET",
    insufficient: "not judged",
  }[rate.result.verdict];

  const lines = [`### ${rate.name}: ${mark}`, "", rate.result.message];
  if (rate.result.badRunIds.length > 0) {
    lines.push(
      "",
      `Runs: ${rate.result.badRunIds
        .map((id) => `[${id}](https://github.com/${repo}/actions/runs/${id})`)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}
