import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendAccessExpiryReminderEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [7, 3, 1] as const;

/**
 * Daily 05:00 UTC (midnight ET).
 *
 * Family Access subscriptions in the cancellation grace window have
 * an access_expires_at set 60 days out (per the Stripe webhook). We
 * send three reminders: 7, 3, and 1 day before that date. Each is
 * dedup-keyed by (subscription_id + days_out) so a family who cancels
 * and resubscribes between reminders gets the new schedule.
 */
const handleAccessExpiry = withCronAlerting(
  "access-expiry",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();
    const now = Date.now();

    const summary: Record<number, number> = {};
    let skipped = 0;

    for (const days of REMINDER_DAYS) {
      const targetDate = new Date(now + days * DAY_MS);
      // Window is [target_day_start, target_day_start + 24h) so the cron
      // catches everyone with access expiring on that calendar day.
      const start = new Date(targetDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + DAY_MS);

      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select(
          `
        id,
        user_id,
        access_expires_at,
        users:user_id (email, first_name, is_deleted, is_suspended)
      `,
        )
        .eq("plan_type", "family_access")
        .gte("access_expires_at", start.toISOString())
        .lt("access_expires_at", end.toISOString());

      if (error) {
        console.error("[cron access-expiry] query failed:", error.message);
        continue;
      }

      type Row = {
        id: string;
        user_id: string;
        access_expires_at: string;
        users: {
          email: string;
          first_name: string | null;
          is_deleted: boolean;
          is_suspended: boolean;
        } | null;
      };

      summary[days] = 0;

      for (const row of (subs ?? []) as unknown as Row[]) {
        if (!row.users || row.users.is_deleted || row.users.is_suspended) {
          skipped++;
          continue;
        }

        const ok = await shouldSendOnce(supabase, {
          recipientUserId: row.user_id,
          emailType: "access_expiry_reminder",
          dedupKey: `${row.id}:${days}d`,
        });
        if (!ok) {
          skipped++;
          continue;
        }

        const expiryDateLabel = new Date(
          row.access_expires_at,
        ).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        await sendAccessExpiryReminderEmail({
          to: row.users.email,
          firstName: row.users.first_name ?? undefined,
          daysUntilExpiry: days,
          expiryDateLabel,
        });
        summary[days]++;
      }
    }

    return NextResponse.json({ success: true, sentByDay: summary, skipped });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleAccessExpiry(request);
}
