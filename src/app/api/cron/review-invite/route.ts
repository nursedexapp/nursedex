import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { sendReviewInviteEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily 13:00 UTC (9am ET in summer, 8am ET in winter).
 *
 * Finds verified nurses whose verified_at is between 14 and 28 days
 * ago and who haven't received a review invite email yet, then mails
 * them their share link with a nudge to invite past clients.
 *
 * Safe to run daily; the email_log dedup keeps a nurse from getting
 * the email more than once per "review_invite" event.
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  const supabase = createServiceRoleClient();
  const now = Date.now();
  const earliest = new Date(now - 28 * DAY_MS).toISOString();
  const latest = new Date(now - 14 * DAY_MS).toISOString();

  const nurseQuery = supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      slug,
      verified_at,
      users!inner ( email, first_name, is_deleted, is_suspended )
    `,
    );
  const { data, error } = await applyVisibleNurseFilter(nurseQuery)
    .gte("verified_at", earliest)
    .lte("verified_at", latest);

  if (error) {
    console.error("[cron review-invite] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  type Row = {
    user_id: string;
    slug: string;
    verified_at: string;
    users: {
      email: string;
      first_name: string | null;
      is_deleted: boolean;
      is_suspended: boolean;
    };
  };

  let sent = 0;
  let skipped = 0;

  for (const row of (data ?? []) as unknown as Row[]) {
    const ok = await shouldSendOnce(supabase, {
      recipientUserId: row.user_id,
      emailType: "review_invite",
      dedupKey: "post_verification_v1",
    });
    if (!ok) {
      skipped++;
      continue;
    }

    await sendReviewInviteEmail({
      to: row.users.email,
      firstName: row.users.first_name ?? undefined,
      reviewLinkUrl: `https://nursedex.com/reviews/${row.slug}`,
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent, skipped });
}
