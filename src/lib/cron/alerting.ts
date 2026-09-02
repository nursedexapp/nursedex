import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { slackPost, ALERTS_CHANNEL_ID } from "@/lib/slack/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordCronHeartbeat } from "./heartbeat";

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
 *
 * It also records the heartbeat every successful run leaves behind (#757).
 * That lives here for the same reason the alerting does: this wrapper already
 * wraps all thirteen crons, so one seam covers every current job and every
 * future one, instead of thirteen edits somebody has to remember (L247).
 * Only a 2xx counts: a run that threw or answered 500 has not done its work,
 * and marking it alive would be a success claim about a failure (L12).
 */
export function withCronAlerting(
  jobName: string,
  handler: CronHandler,
  deps: { now?: () => number } = {},
): CronHandler {
  const now = deps.now ?? Date.now;

  return async (request: NextRequest): Promise<NextResponse> => {
    const startedAt = now();
    try {
      const res = await handler(request);
      if (res.ok) {
        // Read from a clone: consuming the real body would hand Vercel an
        // already-read stream. A body that is not JSON still leaves a
        // heartbeat, because the run happened and only its result is
        // unreadable.
        const result = await res
          .clone()
          .json()
          .catch(() => null);

        // Building the client can fail on its own (a missing key, a bad URL),
        // and that must not turn a cron that did its work into a 500. Reported
        // rather than swallowed: a heartbeat that has quietly stopped being
        // written would make every job look dead to the watchdog at once.
        try {
          await recordCronHeartbeat(createServiceRoleClient(), {
            jobName,
            durationMs: now() - startedAt,
            result,
            now: new Date(),
          });
        } catch (heartbeatErr: unknown) {
          console.error(`[cron ${jobName}] heartbeat skipped:`, heartbeatErr);
          Sentry.captureException(
            heartbeatErr instanceof Error
              ? heartbeatErr
              : new Error(String(heartbeatErr)),
            { tags: { action: "cron_heartbeat", job: jobName } },
          );
        }
      }
      if (!res.ok) {
        const message = `cron "${jobName}" returned status ${res.status}`;
        console.error(`[cron ${jobName}]`, message);
        Sentry.captureMessage(message, {
          level: "error",
          tags: { action: "cron", job: jobName },
        });
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
    text: `Cron failed: \`${jobName}\`\n${message}`,
  });
}
