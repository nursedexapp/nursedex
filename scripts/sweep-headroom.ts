// How much of its deadline the guard mutation sweep is using (#807).
//
// 105 mutants take about 211 seconds under ci.yml's 15 minute timeout, and
// every new guard site adds about two seconds. Nothing reported that ratio, so
// the first sign of growth would have been a red main run naming the timeout,
// which reads as a broken guard rather than as a sweep that outgrew its budget.
//
// The budget is read from the workflow rather than written here. A number
// copied beside its source drifts silently, and a stale one goes on reading as
// a measurement of something (L41, L210).

export type HeadroomInput = {
  elapsedMs: number;
  timeoutMinutes: number;
  /** The share of the deadline the sweep may use, between 0 and 1. */
  maxFraction: number;
};

export type HeadroomResult = {
  withinBudget: boolean;
  fraction: number;
  message: string;
};

/** The `timeout-minutes` ci.yml actually gives the job. */
export function readJobTimeoutMinutes(workflow: string): number {
  const match = workflow.match(/^\s*timeout-minutes:\s*(.+)$/m);
  if (!match) {
    // A default here would be a number nobody chose, and a generous one is
    // exactly the value that makes this check pass forever (L72).
    throw new Error(
      "ci.yml declares no timeout-minutes, so the sweep has no deadline to " +
        "measure itself against. Refusing rather than assuming one.",
    );
  }
  const minutes = Number(match[1].trim());
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(
      `ci.yml's timeout-minutes is "${match[1].trim()}", which is not a ` +
        `positive number of minutes.`,
    );
  }
  return minutes;
}

/**
 * Compare a finished sweep against its deadline.
 *
 * Always returns a message, because the measurement is the point: a run that
 * only spoke up when it was in trouble would leave nobody able to see the
 * growth coming.
 */
export function checkSweepHeadroom(input: HeadroomInput): HeadroomResult {
  const { elapsedMs, timeoutMinutes, maxFraction } = input;

  if (!(maxFraction > 0) || maxFraction > 1) {
    throw new Error(
      `maxFraction must be between 0 and 1, got ${maxFraction}. A fraction ` +
        `above 1 would permit a sweep that cannot finish.`,
    );
  }

  const budgetMs = timeoutMinutes * 60_000;

  // A missing or impossible measurement must not read as the healthiest
  // possible result, which is what a zero would do (L98).
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return {
      withinBudget: false,
      fraction: Number.NaN,
      message:
        `The sweep's duration was not measured (got ${elapsedMs}), so its ` +
        `headroom is unknown. That is a failure of the measurement, not a ` +
        `sweep that finished instantly.`,
    };
  }

  const fraction = elapsedMs / budgetMs;
  const seconds = Math.round(elapsedMs / 1000);
  const used = `${seconds}s of the ${timeoutMinutes} minute job timeout ` +
    `(${Math.round(fraction * 100)}%)`;

  if (fraction > maxFraction) {
    return {
      withinBudget: false,
      fraction,
      message:
        `The guard mutation sweep took ${used}, past the ${Math.round(
          maxFraction * 100,
        )}% it is allowed. It is outgrowing its budget: either the sweep gets ` +
        `faster or the budget is raised deliberately. Letting it run into the ` +
        `timeout would report this as a broken guard instead.`,
    };
  }

  return {
    withinBudget: true,
    fraction,
    message: `The guard mutation sweep took ${used}.`,
  };
}
