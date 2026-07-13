/**
 * CI entry point for the production permission smoke check (#521).
 *
 * Reads the JSON from `supabase db query --linked` on stdin and exits non-zero
 * when production no longer allows what the app needs, or allows something it
 * should not. See scripts/prod-smoke.ts for why this exists.
 *
 * Usage:
 *   supabase db query --linked --output-format json "$(cat scripts/prod-smoke.sql)" \
 *     | npx tsx scripts/check-prod-smoke.ts
 */
import { parseGrantRows, checkGrants, formatSmokeReport } from "./prod-smoke";
import { ALERTS_CHANNEL_ID } from "../src/lib/slack/constants";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Posts the failure to Slack.
 *
 * This does not reuse slackPost from src/lib/slack/client, which imports
 * "server-only" and so only resolves inside the Next bundle. That guard is
 * deliberate (it keeps the bot token out of anything client-side), so this
 * script sends its own request rather than weakening it. The channel id is
 * still imported, so there is one source of truth for where alerts land.
 *
 * Best effort, but never quiet: a missing token is announced in the job log
 * instead of skipped in silence, and a Slack failure never masks the smoke
 * failure, because the exit code below is set from the check, not from this.
 */
async function announce(report: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error(
      "SLACK_BOT_TOKEN is not set, so no Slack alert was sent. The failing job is the only signal.",
    );
    return;
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: ALERTS_CHANNEL_ID,
        text: `Production permission check failed\n\n${report}`,
      }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error ?? "unknown Slack error");
  } catch (err: unknown) {
    console.error(
      "Could not post the Slack alert:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();

  // parseGrantRows throws on an empty or unreadable payload. That is deliberate:
  // a query that never ran must fail the job, never report an all-clear.
  const result = checkGrants(parseGrantRows(raw));
  const report = formatSmokeReport(result);
  console.log(report);

  if (!result.ok) {
    await announce(report);
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
