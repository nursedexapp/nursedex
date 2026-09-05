import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getIssuesNeedingReview } from "@/lib/sentry/issues";
import { slackPost, ALERTS_CHANNEL_ID } from "@/lib/slack/client";

import { unwrapOrThrow, assertNoWriteError } from "@/lib/db/results";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Every 15 minutes. Sentry's free plan has no native Slack/webhook
 * alerting, so this polls the Issues API for anything currently needing
 * review (new, regressed, or reoccurring) and posts a Slack alert for
 * each one not already recorded in sentry_issue_alert_log. Issues already
 * covered by a dedicated alert (cron failures, Stripe webhook failures)
 * are excluded by the query itself (see getIssuesNeedingReview).
 *
 * Posts to Slack BEFORE recording the dedup row, not after: if the Slack
 * post throws, the issue must stay unrecorded so the next poll retries it
 * instead of the alert being silently lost forever.
 *
 * A dedup row is cleared once its issue no longer needs review, so if it
 * later regresses it alerts again instead of staying suppressed.
 */
const handleSentryAlerts = withCronAlerting(
  "sentry-alerts",
  async (_request: NextRequest) => {
    const issues = await getIssuesNeedingReview();
    const supabase = createServiceRoleClient();

    // A failed read is NOT "nothing has been alerted yet" (#847). It empties
    // the dedup set, so every issue already reported is reported again, and
    // the stale-cleanup below then deletes rows it should have kept.
    const loggedRows = await unwrapOrThrow(
      supabase.from("sentry_issue_alert_log").select("issue_id"),
      "the Sentry issues already alerted on",
    );
    const alreadyAlertedIds = new Set(
      (loggedRows ?? []).map((row) => row.issue_id as string),
    );

    let alerted = 0;
    let failed = 0;
    for (const issue of issues) {
      if (alreadyAlertedIds.has(issue.id)) continue;
      try {
        await slackPost("chat.postMessage", {
          channel: ALERTS_CHANNEL_ID,
          text: `Sentry issue needs review: [${issue.shortId}] ${issue.title}\n${issue.culprit}\n${issue.permalink}`,
        });
        // This row IS the dedup. Written unchecked, a failure means the same
        // issue is alerted again on every run of this job.
        await assertNoWriteError(
          supabase
            .from("sentry_issue_alert_log")
            .insert({ issue_id: issue.id }),
          "the alert log entry for a Sentry issue",
        );
        alerted++;
      } catch (err) {
        failed++;
        console.error(
          "[cron sentry-alerts] failed to alert issue",
          issue.id,
          err,
        );
        Sentry.captureException(err, {
          tags: { action: "sentry-alert-relay", issue_id: issue.id },
        });
      }
    }

    const currentIds = new Set(issues.map((issue) => issue.id));
    const staleIds = [...alreadyAlertedIds].filter((id) => !currentIds.has(id));
    if (staleIds.length > 0) {
      await assertNoWriteError(
        supabase
          .from("sentry_issue_alert_log")
          .delete()
          .in("issue_id", staleIds),
        "the cleanup of alert log entries for resolved issues",
      );
    }

    return NextResponse.json({
      success: true,
      alerted,
      failed,
      cleared: staleIds.length,
    });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleSentryAlerts(request);
}
