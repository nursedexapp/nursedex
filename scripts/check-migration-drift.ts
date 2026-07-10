/**
 * CI entry point for the migration drift check (#518).
 *
 * Reads `supabase migration list --linked --output-format json` on stdin and
 * exits non-zero when production is out of step with the migrations in git,
 * failing the workflow loudly rather than passing quietly.
 *
 * Usage:
 *   supabase migration list --linked --output-format json | npx tsx scripts/check-migration-drift.ts
 */
import { parseMigrationList, detectDrift, formatDriftReport } from "./migration-drift";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // A parse failure means the CLI never reported state. Treat it as a failure,
  // never as an all-clear.
  const report = detectDrift(parseMigrationList(raw));
  console.log(formatDriftReport(report));

  if (report.hasDrift) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(
    "Migration drift check failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
