/**
 * CI entry point for the Supabase usage headroom check (#746).
 *
 * Reads the JSON from `supabase db query --linked` on stdin and exits non-zero
 * when production has consumed more of the plan's included usage than the
 * warning fraction allows. The reasoning, and the two dimensions this cannot
 * see, live in scripts/supabase-usage.ts.
 *
 * Usage:
 *   supabase db query --linked --output-format json --file scripts/supabase-usage.sql \
 *     | npx tsx scripts/check-supabase-usage.ts
 */
import { runUsageCheck } from "./supabase-usage";
import { announce } from "./slack-alert";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // Every outcome, including a payload that could not be read at all, is
  // decided in runUsageCheck so each one can be tested. A query that never ran
  // fails the job rather than reporting healthy headroom on a production
  // nobody actually looked at.
  const code = await runUsageCheck({
    raw,
    announceImpl: announce,
    token: process.env.SLACK_BOT_TOKEN,
    log: (message) => console.log(message),
  });

  if (code !== 0) process.exit(code);
}

main().catch((err: unknown) => {
  console.error(
    "Supabase usage check failed to run:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
