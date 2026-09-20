import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getIssuesNeedingReview } from "@/lib/sentry/issues";
import { slackPost, ALERTS_CHANNEL_ID } from "@/lib/slack/client";
import {
  planAlertLogCleanup,
  ALERT_LOG_PAGE,
} from "@/lib/sentry/alert-log-cleanup";

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
 * later regresses it alerts again instead of staying suppressed. That clearing
 * refuses a fetch it cannot trust rather than acting on it (#984): the read is
 * an external call, and one that comes back SHORT makes every recorded issue
 * look resolved, which empties the log and re-alerts everything on the next
 * run. Deleting nothing is always safe here; deleting wrongly costs the
 * channel.
 *
 * That refusal is bounded by size (#1057). On this project no issues needing
 * review is the ordinary healthy state, so refusing every empty fetch meant a
 * log that could never be cleared and a warning below that could never stop.
 */
const handleSentryAlerts = withCronAlerting(
  "sentry-alerts",
  async (_request: NextRequest) => {
    const issues = await getIssuesNeedingReview();
    const supabase = createServiceRoleClient();

    // A failed read is NOT "nothing has been alerted yet" (#847). It empties
    // the dedup set, so every issue already reported is reported again, and
    // the stale-cleanup below then deletes rows it should have kept.
    // Paged, and only when the whole log arrived. PostgREST caps a select at
    // 1,000 rows and returns a healthy looking prefix, so an unbounded read
    // would treat every row past the first page as an issue never alerted on,
    // re-alert it, and then hand the cleanup below a set that is missing them.
    const loggedIds: string[] = [];
    for (let from = 0; ; from += ALERT_LOG_PAGE) {
      const page = await unwrapOrThrow(
        supabase
          .from("sentry_issue_alert_log")
          .select("issue_id")
          .order("alerted_at", { ascending: true })
          .range(from, from + ALERT_LOG_PAGE - 1),
        "the Sentry issues already alerted on",
      );
      const rows = page ?? [];
      loggedIds.push(...rows.map((row) => row.issue_id as string));
      if (rows.length < ALERT_LOG_PAGE) break;
    }
    const alreadyAlertedIds = new Set(loggedIds);

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

    const cleanup = planAlertLogCleanup({
      logged: loggedIds,
      current: issues.map((issue) => issue.id),
    });

    if (cleanup.deleting.length > 0) {
      await assertNoWriteError(
        supabase
          .from("sentry_issue_alert_log")
          .delete()
          .in("issue_id", cleanup.deleting),
        "the cleanup of alert log entries for resolved issues",
      );
    }

    if (cleanup.skipped) {
      // Loud, not silent. A refused cleanup that recurs means the fetch is
      // persistently seeing less than reality, and a run that skipped and one
      // with nothing to clear are otherwise the same output (L11). It reaches
      // last_result on the admin jobs page either way.
      console.warn("[cron sentry-alerts] cleanup skipped:", cleanup.skipped);
      Sentry.captureMessage(
        `[cron sentry-alerts] alert log cleanup skipped: ${cleanup.skipped}`,
        "warning",
      );
    }

    return NextResponse.json({
      success: true,
      alerted,
      failed,
      cleared: cleanup.deleting.length,
      cleanupSkipped: cleanup.skipped,
    });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleSentryAlerts(request);
}
