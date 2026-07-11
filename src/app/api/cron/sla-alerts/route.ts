import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendSlaAlertAdminEmail } from "@/lib/email/send";
import { SLA_HOURS, getSlaState } from "@/lib/admin/sla";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily 14:00 UTC (10am ET).
 *
 * Counts pending verifications past 75% of their SLA (approaching or
 * overdue) and emails every admin/super_admin a single summary if
 * there's anything to flag. Dedup keyed by today's date so admins get
 * exactly one digest per day, even if the cron retries.
 */
const handleSlaAlerts = withCronAlerting(
  "sla-alerts",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();
    const now = Date.now();

    const { data: pending, error: pendingError } = await supabase
      .from("nurse_profiles")
      .select("user_id, tier, updated_at")
      .eq("verification_status", "pending");

    if (pendingError) {
      console.error(
        "[cron sla-alerts] pending query failed:",
        pendingError.message,
      );
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    type PendingRow = {
      user_id: string;
      tier: "free" | "featured";
      updated_at: string;
    };

    let approachingCount = 0;
    let overdueCount = 0;
    for (const row of (pending ?? []) as PendingRow[]) {
      const hours =
        (now - new Date(row.updated_at).getTime()) / (60 * 60 * 1000);
      const slaHours = SLA_HOURS[row.tier];
      const state = getSlaState(hours, slaHours);
      if (state === "approaching") approachingCount++;
      if (state === "overdue") overdueCount++;
    }

    if (approachingCount === 0 && overdueCount === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 0,
        reason: "queue_clean",
      });
    }

    const { data: admins, error: adminsError } = await supabase
      .from("users")
      .select("id, email")
      .in("role", ["admin", "super_admin"])
      .eq("is_deleted", false);

    if (adminsError) {
      console.error(
        "[cron sla-alerts] admin query failed:",
        adminsError.message,
      );
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    type AdminRow = { id: string; email: string };

    const todayBucket = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let skipped = 0;

    for (const admin of (admins ?? []) as AdminRow[]) {
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: admin.id,
        emailType: "sla_alert_admin",
        dedupKey: `bucket_${todayBucket}`,
      });
      if (!ok) {
        skipped++;
        continue;
      }
      await sendSlaAlertAdminEmail({
        to: admin.email,
        approachingCount,
        overdueCount,
      });
      sent++;
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      approachingCount,
      overdueCount,
    });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleSlaAlerts(request);
}
