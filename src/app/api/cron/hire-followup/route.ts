import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendHireFollowupEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily 13:00 UTC (9am ET).
 *
 * For each family who revealed a nurse ~30 days ago and hasn't
 * recorded a hire (any status, including rejected) for that nurse,
 * send a single "did you find a nurse?" follow-up email per family.
 * The email_log dedup is keyed by family + the date bucket so a
 * family doesn't get repeated nudges over multiple reveals on the
 * same day.
 */
const handleHireFollowup = withCronAlerting(
  "hire-followup",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();
    const now = Date.now();
    const earliest = new Date(now - 35 * DAY_MS).toISOString();
    const latest = new Date(now - 28 * DAY_MS).toISOString();

    const { data: reveals, error } = await supabase
      .from("reveals")
      .select(
        `
      family_user_id,
      revealed_at,
      nurse_user_id,
      users:family_user_id (
        email,
        first_name,
        is_deleted,
        is_suspended
      )
    `,
      )
      .gte("revealed_at", earliest)
      .lte("revealed_at", latest);

    if (error) {
      console.error("[cron hire-followup] query failed:", error.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    type Row = {
      family_user_id: string;
      revealed_at: string;
      nurse_user_id: string;
      users: {
        email: string;
        first_name: string | null;
        is_deleted: boolean;
        is_suspended: boolean;
      } | null;
    };

    // Group by family so we send at most one followup per family per
    // bucket, even if they revealed multiple nurses.
    const byFamily = new Map<
      string,
      { email: string; firstName: string | null; nurseIds: Set<string> }
    >();
    for (const row of (reveals ?? []) as unknown as Row[]) {
      if (!row.users || row.users.is_deleted || row.users.is_suspended) {
        continue;
      }
      const existing = byFamily.get(row.family_user_id);
      if (existing) {
        existing.nurseIds.add(row.nurse_user_id);
      } else {
        byFamily.set(row.family_user_id, {
          email: row.users.email,
          firstName: row.users.first_name,
          nurseIds: new Set([row.nurse_user_id]),
        });
      }
    }

    let sent = 0;
    let skipped = 0;

    for (const [familyUserId, info] of byFamily.entries()) {
      // Skip if the family has already recorded a hire (any status) with
      // any of the candidate nurses; the followup nudge is only useful
      // for families who haven't yet acted.
      const { data: hires } = await supabase
        .from("hires")
        .select("nurse_user_id")
        .eq("family_user_id", familyUserId)
        .in("nurse_user_id", [...info.nurseIds]);

      const recorded = new Set(
        ((hires ?? []) as Array<{ nurse_user_id: string }>).map(
          (h) => h.nurse_user_id,
        ),
      );
      const allRecorded = [...info.nurseIds].every((n) => recorded.has(n));
      if (allRecorded) {
        skipped++;
        continue;
      }

      const todayBucket = new Date().toISOString().slice(0, 10);
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: familyUserId,
        emailType: "hire_followup",
        dedupKey: `bucket_${todayBucket}`,
      });
      if (!ok) {
        skipped++;
        continue;
      }

      await sendHireFollowupEmail({
        to: info.email,
        firstName: info.firstName ?? undefined,
      });
      sent++;
    }

    return NextResponse.json({ success: true, sent, skipped });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleHireFollowup(request);
}
