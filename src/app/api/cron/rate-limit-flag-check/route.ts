import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { sendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendRateLimitFlaggedAdminEmail } from "@/lib/email/send";
import { RATE_LIMITS } from "@/lib/constants";
import { flaggedSinceDate } from "@/lib/rate-limit/flagged";

import { unwrapOrThrow } from "@/lib/db/results";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Daily 05:15 UTC. Counts distinct families with
 * consecutive_captcha_days >= 3 on a day inside the recent window
 * (see lib/rate-limit/flagged), so the digest reflects who is doing
 * this now and clears when nobody is. If anything to flag, emails every admin/super_admin a single
 * digest pointing at /admin/accounts?tab=flagged. Daily-bucket dedup so
 * admins get exactly one digest per day even on cron retries.
 */
const handleRateLimitFlagCheck = withCronAlerting(
  "rate-limit-flag-check",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();

    // Families at or over the captcha-day flag threshold on a RECENT day.
    // The rows stay in the table forever, so without the window this counted
    // every family ever flagged and mailed that count daily, whether or not
    // anybody was still doing it (#425).
    // A failed read is NOT "nobody is flagged" (#847). It made the job return
    // success with reason "none_flagged", which is a watcher reporting that
    // everything is fine because it could not look (L98).
    const rows = await unwrapOrThrow(
      supabase
        .from("rate_limit_reveals")
        .select("family_user_id, consecutive_captcha_days, date")
        .gte(
          "consecutive_captcha_days",
          RATE_LIMITS.CONSECUTIVE_CAPTCHA_DAYS_FLAG,
        )
        .gte("date", flaggedSinceDate(new Date()))
        .order("date", { ascending: false }),
      "the families flagged for repeated captcha days",
    );

    type Row = {
      family_user_id: string;
      consecutive_captcha_days: number;
      date: string;
    };

    const seen = new Set<string>();
    for (const r of (rows ?? []) as Row[]) {
      seen.add(r.family_user_id);
    }
    const flaggedCount = seen.size;

    if (flaggedCount === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 0,
        reason: "none_flagged",
      });
    }

    // A failed read is NOT "there are no admins" (#847). It delivers the alert
    // to nobody while the job reports success, which is the fan-out failure in
    // L120: a newly added recipient, or a read that fell over, is silently
    // delivered to no one down a path that looks healthy.
    const admins = await unwrapOrThrow(
      supabase
        .from("users")
        .select("id, email")
        .in("role", ["admin", "super_admin"])
        .eq("is_deleted", false),
      "the admins to alert about flagged families",
    );

    type AdminRow = { id: string; email: string };

    const todayBucket = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const admin of (admins ?? []) as AdminRow[]) {
      const outcome = await sendOnce(
        supabase,
        {
          recipientUserId: admin.id,
          emailType: "rate_limit_flagged_admin",
          dedupKey: `bucket_${todayBucket}`,
        },
        () => sendRateLimitFlaggedAdminEmail({ to: admin.email, flaggedCount }),
      );
      if (outcome === "skipped") {
        skipped++;
        continue;
      }
      if (outcome === "failed") {
        failed++;
        continue;
      }
      sent++;
    }

    if (sent === 0 && failed > 0) {
      return NextResponse.json(
        { error: "Every rate limit alert failed to send", skipped, failed },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      failed,
      flaggedCount,
    });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleRateLimitFlagCheck(request);
}
