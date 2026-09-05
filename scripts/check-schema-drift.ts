/**
 * CI entry point for the schema contents comparison (#890).
 *
 * Takes two files of `supabase db query --output-format json` output: the
 * shape of a database built from the migrations, and the shape of production.
 * Both are produced by the same query, scripts/schema-shape.sql, so the
 * expected side is never written down and cannot drift.
 *
 *   tsx scripts/check-schema-drift.ts <from-migrations.json> <production.json>
 *
 * IT REPORTS AND DOES NOT YET FAIL ON A DIFFERENCE, deliberately, and this is
 * temporary. A new validator on a live data path has to be calibrated against
 * a sample fetched through the same code path it will guard, and observed for
 * one real cycle before it is allowed to block (L56). Nobody has yet seen what
 * a healthy comparison looks like here: Supabase itself may add objects to a
 * hosted project that a local one does not have, and every one of those would
 * arrive as a finding on the first run. Failing on them would train everyone
 * to ignore this job before it had ever said anything true.
 *
 * Promoting it to a real gate, once one run has shown what the baseline noise
 * is, is #1031. That issue is filed in the same change as this, because
 * a guard shipped deliberately inactive with nothing tracking its activation
 * is just a guard that never runs (L65).
 *
 * A FAILED READ DOES FAIL, now. A comparison that could not look and a
 * comparison that found nothing are the same output otherwise, and the first
 * is the failure this whole check exists to remove.
 */
import { readFileSync } from "node:fs";
import {
  parseShapeRows,
  compareShapes,
  formatShapeReport,
} from "./schema-drift";
import { announce } from "./slack-alert";

/**
 * Whether a difference fails the job.
 *
 * An environment variable rather than an edit, so the first enforcing run can
 * be tried by hand before it is made the default. Only the exact string "1"
 * turns it on: "0", "false" and "no" are all things somebody would write
 * meaning off, and a truthiness check would read every one of them as on.
 */
export function isEnforcing(env: Record<string, string | undefined>): boolean {
  return env.SCHEMA_DRIFT_ENFORCE === "1";
}

export interface Outcome {
  exitCode: 0 | 1;
  /** What the Slack alert is titled, or null when there is nothing to say. */
  alertTitle: string | null;
  /** What the log says beyond the report, or null when the report is enough. */
  note: string | null;
}

/**
 * What to do about the comparison.
 *
 * Pulled out of main so the one decision that matters here, whether a
 * difference stops the job, has a test rather than only ever being exercised
 * by a real run against production.
 */
export function decideOutcome(matches: boolean, enforcing: boolean): Outcome {
  if (matches) {
    return { exitCode: 0, alertTitle: null, note: null };
  }

  if (enforcing) {
    return {
      exitCode: 1,
      alertTitle: "Production's schema is not what the migrations build",
      note: null,
    };
  }

  return {
    exitCode: 0,
    alertTitle:
      "Production's schema differs from the migrations (observing, not failing)",
    // Said out loud rather than left to the exit code. A job that found
    // something and passed anyway is indistinguishable from one that found
    // nothing, unless it says which it was (L11).
    note:
      "\nThis job is OBSERVING rather than failing: the differences above have " +
      "not been seen before and may be things Supabase adds to a hosted " +
      "project. Set SCHEMA_DRIFT_ENFORCE=1 once the baseline is understood.",
  };
}

async function main(): Promise<void> {
  const [expectedPath, actualPath] = process.argv.slice(2);

  if (!expectedPath || !actualPath) {
    throw new Error(
      "Needs two files: the shape built from the migrations, and production's. " +
        "Without both, this would compare a schema against nothing.",
    );
  }

  // parseShapeRows throws on an empty or unreadable payload, which is the
  // point: an empty result and two schemas that agree are the same answer to a
  // set comparison.
  const expected = parseShapeRows(readFileSync(expectedPath, "utf8"));
  const actual = parseShapeRows(readFileSync(actualPath, "utf8"));

  const result = compareShapes(expected, actual);
  const report = formatShapeReport(result);
  console.log(report);

  const outcome = decideOutcome(result.matches, isEnforcing(process.env));

  if (outcome.alertTitle) {
    await announce({
      title: outcome.alertTitle,
      report,
      token: process.env.SLACK_BOT_TOKEN,
    });
  }
  if (outcome.note) console.log(outcome.note);
  if (outcome.exitCode !== 0) process.exit(outcome.exitCode);
}

// Only when run directly, so the tests can import the decision above.
if (process.argv[1]?.endsWith("check-schema-drift.ts")) {
  main().catch((err: unknown) => {
    console.error(
      "The schema comparison could not run:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  });
}
