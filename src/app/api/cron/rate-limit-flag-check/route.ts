import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendRateLimitFlaggedAdminEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Daily 05:00 UTC. Counts distinct families with
 * consecutive_captcha_days >= 3 in their most recent rate_limit_reveals
 * row. If anything to flag, emails every admin/super_admin a single
 * digest pointing at /admin/accounts?tab=flagged. Daily-bucket dedup so
 * admins get exactly one digest per day even on cron retries.
 */
const handleRateLimitFlagCheck = withCronAlerting(
  "rate-limit-flag-check",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();

    // Latest row per family with consecutive_captcha_days >= 3.
    const { data: rows } = await supabase
      .from("rate_limit_reveals")
      .select("family_user_id, consecutive_captcha_days, date")
      .gte("consecutive_captcha_days", 3)
      .order("date", { ascending: false });

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

    const { data: admins } = await supabase
      .from("users")
      .select("id, email")
      .in("role", ["admin", "super_admin"])
      .eq("is_deleted", false);

    type AdminRow = { id: string; email: string };

    const todayBucket = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let skipped = 0;

    for (const admin of (admins ?? []) as AdminRow[]) {
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: admin.id,
        emailType: "rate_limit_flagged_admin",
        dedupKey: `bucket_${todayBucket}`,
      });
      if (!ok) {
        skipped++;
        continue;
      }
      await sendRateLimitFlaggedAdminEmail({
        to: admin.email,
        flaggedCount,
      });
      sent++;
    }

    return NextResponse.json({ success: true, sent, skipped, flaggedCount });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleRateLimitFlagCheck(request);
}
