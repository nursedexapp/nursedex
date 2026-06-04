import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendRenewalReminderEmail } from "@/lib/email/send";
import { PRICING } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily 14:00 UTC. Active subscriptions whose current_period_end is
 * 3 calendar days from now get a heads-up email. Subs with
 * cancel_at_period_end already true are skipped (they got a
 * cancellation email and don't need a renewal reminder).
 *
 * Dedup keyed by subscription_id + period_end so a sub renewing
 * monthly gets exactly one reminder per period.
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  const supabase = createServiceRoleClient();
  const target = new Date(Date.now() + 3 * DAY_MS);
  const start = new Date(target);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select(
      `
      id,
      user_id,
      plan_type,
      current_period_end,
      cancel_at_period_end,
      status,
      users:user_id (email, first_name, is_deleted, is_suspended)
    `,
    )
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .gte("current_period_end", start.toISOString())
    .lt("current_period_end", end.toISOString());

  if (error) {
    console.error("[cron renewal-reminder] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  type Row = {
    id: string;
    user_id: string;
    plan_type: "nurse_featured" | "family_access";
    current_period_end: string;
    cancel_at_period_end: boolean;
    status: string;
    users: {
      email: string;
      first_name: string | null;
      is_deleted: boolean;
      is_suspended: boolean;
    } | null;
  };

  let sent = 0;
  let skipped = 0;

  for (const row of (subs ?? []) as unknown as Row[]) {
    if (!row.users || row.users.is_deleted || row.users.is_suspended) {
      skipped++;
      continue;
    }
    const ok = await shouldSendOnce(supabase, {
      recipientUserId: row.user_id,
      emailType: "renewal_reminder",
      dedupKey: `${row.id}:${row.current_period_end}`,
    });
    if (!ok) {
      skipped++;
      continue;
    }

    const isNurse = row.plan_type === "nurse_featured";
    await sendRenewalReminderEmail({
      to: row.users.email,
      firstName: row.users.first_name ?? undefined,
      planLabel: isNurse ? "Featured" : "Family Access",
      // NOTE: shows the monthly Family Access price. Annual subscribers are
      // approximated here until billing_interval is tracked per subscription;
      // their reminder understates the $99/yr renewal. See PR follow-up.
      amount: `$${
        isNurse
          ? PRICING.NURSE_FEATURED_MONTHLY.toFixed(2)
          : PRICING.FAMILY_ACCESS_MONTHLY.toFixed(2)
      }`,
      renewalDateLabel: new Date(row.current_period_end).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" },
      ),
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent, skipped });
}
