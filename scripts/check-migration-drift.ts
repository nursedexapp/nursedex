/**
 * CI entry point for the migration drift check (#518).
 *
 * Reads `supabase migration list --linked --output-format json` on stdin and
 * exits non-zero when production is out of step with the migrations in git,
 * failing the workflow loudly rather than passing quietly. The failure also
 * posts to Slack (#816), so it is not a red job nobody was told about.
 *
 * Usage:
 *   supabase migration list --linked --output-format json | npx tsx scripts/check-migration-drift.ts
 */
import { runDriftCheck } from "./migration-drift";
import { makeBranchLookup } from "./migration-branches";
import { announce } from "./slack-alert";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // Every outcome, including a payload that could not be read at all, is
  // decided in runDriftCheck so each one can be tested. A parse failure is a
  // failure, never an all-clear.
  const code = await runDriftCheck({
    raw,
    announceImpl: announce,
    token: process.env.SLACK_BOT_TOKEN,
    log: (message) => console.log(message),
    // Tells "applied ahead of an unmerged PR", which is the safe order, from
    // "applied from nowhere", which is not (#908). Needs the workflow's
    // fetch-depth: 0; without it the lookup answers null and everything
    // untracked keeps failing, which is the old behaviour rather than a
    // silent all clear.
    lookupBranches: makeBranchLookup(),
  });

  if (code !== 0) process.exit(code);
}

main().catch((err: unknown) => {
  console.error(
    "Migration drift check failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
