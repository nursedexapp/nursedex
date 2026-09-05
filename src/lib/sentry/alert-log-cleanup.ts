/**
 * How much of the Sentry alert log one run may clear (#984).
 *
 * The cron records every issue it has alerted on, and deletes a record once
 * the issue no longer needs review, so a regression alerts again rather than
 * staying suppressed. That deletion is driven by an external fetch, and the
 * route refuses a FAILED fetch but not one that came back SHORT: a rate limit,
 * a changed filter, one page returned instead of three. Every logged id then
 * looks resolved, the log is emptied, and the next run posts every issue to
 * Slack again.
 *
 * The cost lands on a person. These go to the alerts channel, and a mass
 * re-alert is what teaches somebody to stop reading it (L36).
 *
 * A cleanup that deletes whatever its read did not mention turns every
 * incompleteness in that read into permanent deletion, so it has to refuse on
 * a short read and not only on a failed one (L211). Deleting nothing is always
 * safe here: a stale row costs one suppressed re-alert if that issue ever
 * regresses. Deleting wrongly costs the channel.
 */

/**
 * A log this small drains in full without question.
 *
 * A handful of rows going stale at once is ordinary, and refusing it would
 * leave the log silting up forever. Below this size the whole log going stale
 * is not evidence of anything.
 */
export const CLEANUP_SMALL_LOG = 10;

/**
 * How many alert log rows one read asks for.
 *
 * Here rather than in the route so a test can fill exactly one page and
 * exercise the loop's real exit condition, instead of a seam that stands in
 * for it. PostgREST's own default cap is 1,000, and a read that does not page
 * gets a healthy looking prefix rather than an error.
 */
export const ALERT_LOG_PAGE = 1000;

/**
 * How much of a larger log one run may clear before it is treated as a bad
 * read rather than a lot of resolutions.
 *
 * Between two runs fifteen minutes apart, a few issues go stale. Most of the
 * log going stale at once is a fetch that saw less than reality. Half is
 * chosen rather than measured: nobody has a distribution of how many issues
 * are resolved per quarter hour, and the number is only ever compared against
 * a population this job can see, so it is stated here rather than implied.
 */
export const CLEANUP_MAX_SHARE = 0.5;

export interface CleanupPlan {
  /** The ids to delete. Empty when the read cannot be trusted. */
  deleting: string[];
  /**
   * Why nothing is being deleted, or null when the cleanup ran normally.
   *
   * Null rather than an empty string: a skipped cleanup and a cleanup with
   * nothing to do are different outcomes, and reporting them the same way
   * would make a persistently refused cleanup invisible (L11).
   */
  skipped: string | null;
}

export function planAlertLogCleanup(args: {
  /** Every issue id currently in the alert log. */
  logged: string[];
  /** Every issue id the latest fetch returned. */
  current: string[];
}): CleanupPlan {
  const { logged, current } = args;

  // Nothing recorded, so nothing to protect. Reporting a skip here would make
  // a healthy quiet run look like a refused one.
  if (logged.length === 0) return { deleting: [], skipped: null };

  if (current.length === 0) {
    return {
      deleting: [],
      skipped:
        `the fetch returned no issues at all while ${logged.length} are ` +
        "recorded, so every one of them would have looked resolved. An empty " +
        "read cannot justify emptying the log.",
    };
  }

  const currentIds = new Set(current);
  const stale = logged.filter((id) => !currentIds.has(id));

  if (
    logged.length > CLEANUP_SMALL_LOG &&
    stale.length > logged.length * CLEANUP_MAX_SHARE
  ) {
    return {
      deleting: [],
      skipped:
        `the fetch would have cleared ${stale.length} of ${logged.length} ` +
        "recorded issues in one run, which is more than this tolerates. " +
        "Between runs a few go stale; most of them at once is a read that " +
        "saw less than reality.",
    };
  }

  return { deleting: stale, skipped: null };
}
