/**
 * CI entry point for the scheduled dependency audit (#405).
 *
 * Reads `npm audit --json` on stdin and prints a severity summary, also
 * appending it to the GitHub Actions step summary when GITHUB_STEP_SUMMARY is
 * set. Exits 0 even when advisories exist: the audit is a non-blocking signal,
 * not a gate (the tree carries transitive advisories that would otherwise turn
 * every run red and get ignored). A genuinely broken audit still fails: a
 * payload that will not parse throws below and exits non-zero.
 *
 * Usage:
 *   npm audit --json | npx tsx scripts/check-dependency-audit.ts
 */
import { appendFileSync } from "node:fs";
import { parseAudit, formatAuditReport } from "./dependency-audit";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // A parse failure means npm audit never produced a report (a network error,
  // a registry outage). Treat it as a failure, never as an all-clear.
  const report = parseAudit(raw);
  const summary = formatAuditReport(report);

  console.log(summary);

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    appendFileSync(stepSummary, `\n\`\`\`\n${summary}\n\`\`\`\n`);
  }
}

main().catch((err: unknown) => {
  console.error(
    "Dependency audit failed to run:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
