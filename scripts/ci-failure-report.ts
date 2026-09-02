/**
 * Turns a failing job's log into something a Slack message can carry (#796).
 *
 * The job that fails here is a scheduled one, so nobody is watching the run.
 * The Slack message is the whole signal, and a message that arrives with
 * nothing under its title is no better than the red job it was meant to
 * replace.
 */

/**
 * How much of the log survives. Slack accepts far more than this in one
 * message, but a wall of scrollback is not read, and the part worth reading is
 * short. Chosen to hold a vitest failure block with room to spare.
 */
export const SLACK_REPORT_LIMIT = 2500;

/**
 * The tail of the log, because test runners print the failures and the summary
 * last, and the head is the runner's banner.
 *
 * An empty log is reported as such rather than passed through: a job that
 * failed before producing any output is a different and worse failure than one
 * that printed why, and the two must not arrive looking the same (L11).
 */
export function buildFailureReport(log: string): string {
  const trimmed = log.trim();

  if (!trimmed) {
    return (
      "The job failed and produced no output at all, so there is nothing here " +
      "saying why. That usually means it died before the checks ran (a missing " +
      "secret, a failed install). The run's own log in the Actions tab is the " +
      "only remaining source."
    );
  }

  if (trimmed.length <= SLACK_REPORT_LIMIT) return trimmed;

  return (
    `(log truncated: showing the last ${SLACK_REPORT_LIMIT} characters)\n\n` +
    trimmed.slice(-SLACK_REPORT_LIMIT)
  );
}
