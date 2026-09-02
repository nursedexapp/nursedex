/**
 * Posts a failing scheduled job's log to Slack (#796).
 *
 * Used as an `if: failure()` step: the job pipes its own output to a file, and
 * this sends the useful end of it. Without this a scheduled job's failure is a
 * red mark in the Actions tab that nobody is looking at, which is the same gap
 * the checks themselves exist to close (L13).
 *
 * Usage:
 *   tsx scripts/announce-ci-failure.ts "Third party health checks failed" run.log
 */
import { readFileSync } from "node:fs";
import { buildFailureReport } from "./ci-failure-report";
import { announce } from "./slack-alert";

async function main(): Promise<void> {
  const [, , title, logPath] = process.argv;

  if (!title) {
    throw new Error(
      "No title was given, so the alert could not say which check failed.",
    );
  }

  // A missing log file is itself reportable: the alert still goes out saying
  // the job produced nothing, rather than the alerter dying quietly on top of
  // the failure it was sent to report.
  let log = "";
  try {
    log = logPath ? readFileSync(logPath, "utf8") : "";
  } catch (err: unknown) {
    log = `The log at ${logPath} could not be read: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  await announce({
    title,
    report: buildFailureReport(log),
    token: process.env.SLACK_BOT_TOKEN,
  });
}

main().catch((err: unknown) => {
  console.error(
    "Could not announce the failure:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
