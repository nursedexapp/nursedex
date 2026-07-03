import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  sendPaymentFailureWarningEmail,
  sendPaymentFailureFinalEmail,
} from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOUR_MS = 60 * 60 * 1000;
const PORTAL_URL = "https://nursedex.com/dashboard";

/**
 * Daily 14:00 UTC (10am ET).
 *
 * For every subscription in past_due, count days since
 * current_period_end (Stripe pins this at the unpaid period's end
 * date when the renewal fails, so it's a stable anchor):
 *   - 1 day past:  Day 1 of 3 dunning
 *   - 2 days past: Day 2 of 3 dunning
 *   - >=3 days:    Final notice email AND downgrade in the same step
 *
 * Featured nurse downgrade: nurse_profiles.tier = 'free'.
 * Family Access downgrade:  subscription.access_expires_at = now (no
 *                           60 day grace; the family didn't pay).
 *
 * Per-subscription dedup keys ("pf_day1", "pf_day2", "pf_final") so
 * each email fires at most once per subscription regardless of cron
 * retries or status flapping.
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  const supabase = createServiceRoleClient();
  const now = Date.now();

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select(
      `
      id,
      user_id,
      plan_type,
      status,
      current_period_end,
      access_expires_at,
      users:user_id (email, first_name, is_deleted, is_suspended)
    `,
    )
    .eq("status", "past_due");

  if (error) {
    console.error("[cron payment-failure] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  type Row = {
    id: string;
    user_id: string;
    plan_type: "nurse_featured" | "family_access";
    status: string;
    current_period_end: string;
    access_expires_at: string | null;
    users: {
      email: string;
      first_name: string | null;
      is_deleted: boolean;
      is_suspended: boolean;
    } | null;
  };

  let day1 = 0;
  let day2 = 0;
  let finalAndDowngrade = 0;
  let skipped = 0;

  for (const row of (subs ?? []) as unknown as Row[]) {
    if (!row.users || row.users.is_deleted || row.users.is_suspended) {
      skipped++;
      continue;
    }

    const periodEnd = new Date(row.current_period_end).getTime();
    const hoursPast = (now - periodEnd) / HOUR_MS;
    const daysPast = Math.floor(hoursPast / 24);

    const isNurse = row.plan_type === "nurse_featured";
    const planLabel = isNurse ? "Featured" : "Family Access";

    if (daysPast < 1) {
      // Stripe is still queuing the first retry. Nothing to do.
      skipped++;
      continue;
    }

    // Each dunning step is gated independently on "is this day threshold
    // met AND not yet sent" rather than an exact daysPast match, so a
    // missed cron run (Vercel outage, deploy window) still catches up on
    // every step it skipped instead of losing it permanently (#421).
    let sentAny = false;

    if (daysPast >= 1) {
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: row.user_id,
        emailType: "payment_failure_warning",
        dedupKey: `${row.id}:pf_day1`,
      });
      if (ok) {
        await sendPaymentFailureWarningEmail({
          to: row.users.email,
          firstName: row.users.first_name ?? undefined,
          dayNumber: 1,
          planLabel,
          consequenceLabel: isNurse
            ? "If we can't charge by day 3, your Featured badge will end and you'll go back to the free plan."
            : "If we can't charge by day 3, your access to revealed nurse contact info will end.",
          portalUrl: PORTAL_URL,
        });
        day1++;
        sentAny = true;
      }
    }

    if (daysPast >= 2) {
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: row.user_id,
        emailType: "payment_failure_warning",
        dedupKey: `${row.id}:pf_day2`,
      });
      if (ok) {
        await sendPaymentFailureWarningEmail({
          to: row.users.email,
          firstName: row.users.first_name ?? undefined,
          dayNumber: 2,
          planLabel,
          consequenceLabel: isNurse
            ? "Tomorrow your Featured badge ends and you go back to the free plan unless we can charge."
            : "Tomorrow your access to revealed nurse contact info ends unless we can charge.",
          portalUrl: PORTAL_URL,
        });
        day2++;
        sentAny = true;
      }
    }

    if (daysPast >= 3) {
      // Downgrade first and check its error; only record pf_final as sent
      // (via shouldSendOnce) once the downgrade actually succeeded. The old
      // order recorded "sent" before the write, so a failed downgrade was
      // never retried and an already-emailed user could keep paid access
      // forever (#416).
      const downgradeResult = isNurse
        ? await supabase
            .from("nurse_profiles")
            .update({ tier: "free" })
            .eq("user_id", row.user_id)
        : await supabase
            .from("subscriptions")
            .update({ access_expires_at: new Date().toISOString() })
            .eq("id", row.id);

      if (downgradeResult.error) {
        console.error(
          "[cron payment-failure] downgrade failed for",
          row.id,
          downgradeResult.error.message,
        );
      } else {
        const ok = await shouldSendOnce(supabase, {
          recipientUserId: row.user_id,
          emailType: "payment_failure_final",
          dedupKey: `${row.id}:pf_final`,
        });
        if (ok) {
          await sendPaymentFailureFinalEmail({
            to: row.users.email,
            firstName: row.users.first_name ?? undefined,
            planLabel,
            consequenceSummary: isNurse
              ? "After three days of unsuccessful billing attempts, your Featured badge has been removed and your profile is back on the free plan."
              : "After three days of unsuccessful billing attempts, your access to revealed nurse contact info has ended.",
            portalUrl: PORTAL_URL,
          });
          finalAndDowngrade++;
          sentAny = true;
        }
      }
    }

    if (!sentAny) skipped++;
  }

  return NextResponse.json({
    success: true,
    day1,
    day2,
    finalAndDowngrade,
    skipped,
  });
}
