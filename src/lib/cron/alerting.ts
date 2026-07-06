import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { slackPost, ALERTS_CHANNEL_ID } from "@/lib/slack/client";

type CronHandler = (request: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a cron route's GET handler with failure alerting (#397): a thrown
 * error or a non-2xx response from the handler now reports to Sentry and
 * posts a Slack ops alert naming the job, instead of failing silently.
 * Crons run at most once per their schedule (no Stripe-style retry
 * storm), so unlike the webhook alert (#396) this doesn't need per-run
 * dedup.
 *
 * Deliberately does NOT own auth: consulting-invoice accepts either the
 * cron secret or an admin secret for manual re-runs, so auth stays each
 * route's own explicit call to verifyCronAuth (or equivalent) before
 * this wrapper's handler runs.
 */
export function withCronAlerting(jobName: string, handler: CronHandler): CronHandler {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const res = await handler(request);
      if (!res.ok) {
        const message = `cron "${jobName}" returned status ${res.status}`;
        console.error(`[cron ${jobName}]`, message);
        Sentry.captureMessage(message, "error");
        await alertOpsSlack(jobName, message).catch((slackErr) =>
          console.error(`[cron ${jobName}] slack alert failed:`, slackErr),
        );
      }
      return res;
    } catch (err) {
      console.error(`[cron ${jobName}]`, err);
      Sentry.captureException(err, { tags: { action: "cron", job: jobName } });
      // Best-effort: a failed alert must not mask the real 500.
      const message = err instanceof Error ? err.message : String(err);
      await alertOpsSlack(jobName, message).catch((slackErr) =>
        console.error(`[cron ${jobName}] slack alert failed:`, slackErr),
      );
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

async function alertOpsSlack(jobName: string, message: string): Promise<void> {
  await slackPost("chat.postMessage", {
    channel: ALERTS_CHANNEL_ID,
    text: `🚨 Cron failed: \`${jobName}\`\n${message}`,
  });
}
