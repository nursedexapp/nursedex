/**
 * CI entry point for the production permission smoke check (#521).
 *
 * Reads the JSON from `supabase db query --linked` on stdin and exits non-zero
 * when production no longer allows what the app needs, or allows something it
 * should not. The reasoning lives in scripts/prod-smoke.ts; the alert path, and
 * every way it can fail, in scripts/slack-alert.ts.
 *
 * Usage:
 *   supabase db query --linked --output-format json "$(cat scripts/prod-smoke.sql)" \
 *     | npx tsx scripts/check-prod-smoke.ts
 */
import { parseGrantRows, checkGrants, formatSmokeReport } from "./prod-smoke";
import { announce } from "./slack-alert";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // parseGrantRows throws on an empty or unreadable payload. That is deliberate:
  // a query that never ran must fail the job, never report an all-clear on a
  // production nobody actually looked at.
  const result = checkGrants(parseGrantRows(raw));
  const report = formatSmokeReport(result);
  console.log(report);

  if (!result.ok) {
    await announce({
      title: "Production permission check failed",
      report,
      token: process.env.SLACK_BOT_TOKEN,
    });
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    "Production permission check failed to run:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
