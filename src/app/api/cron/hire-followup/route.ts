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
 * Daily 13:20 UTC (9am ET).
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

    // Every candidate family's hires in ONE query, rather than one per family
    // inside the loop (#441). The round trips came out of the same 60 second
    // budget the email sends share, and the count grew with the number of
    // families rather than staying flat. The reveal window bounds both lists,
    // so this stays well inside the row cap on a single response.
    const familyIds = [...byFamily.keys()];
    const nurseIds = [
      ...new Set([...byFamily.values()].flatMap((info) => [...info.nurseIds])),
    ];

    const { data: hires } = familyIds.length
      ? await supabase
          .from("hires")
          .select("family_user_id, nurse_user_id")
          .in("family_user_id", familyIds)
          .in("nurse_user_id", nurseIds)
      : { data: [] };

    // Keyed by family, because one query covers all of them: matching on the
    // nurse alone would let one family's hire silence another's followup.
    const recordedByFamily = new Map<string, Set<string>>();
    for (const hire of (hires ?? []) as Array<{
      family_user_id: string;
      nurse_user_id: string;
    }>) {
      const existing = recordedByFamily.get(hire.family_user_id);
      if (existing) existing.add(hire.nurse_user_id);
      else recordedByFamily.set(hire.family_user_id, new Set([hire.nurse_user_id]));
    }

    for (const [familyUserId, info] of byFamily.entries()) {
      // Skip if the family has already recorded a hire (any status) with
      // any of the candidate nurses; the followup nudge is only useful
      // for families who haven't yet acted.
      const recorded = recordedByFamily.get(familyUserId) ?? new Set<string>();
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
