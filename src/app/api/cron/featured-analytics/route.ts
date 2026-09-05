import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { sendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { sendFeaturedAnalyticsEmail } from "@/lib/email/send";

import { unwrapOrThrow } from "@/lib/db/results";
export const runtime = "nodejs";
export const maxDuration = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

interface WeekSums {
  profileViews: number;
  saves: number;
  reveals: number;
}

/**
 * Monday 14:30 UTC. Sums each Featured nurse's nurse_analytics rows
 * for the last 7 days vs the previous 7 days, then emails them the
 * snapshot. Skips nurses with zero activity in both windows so we
 * don't ship a "0 vs 0" email. Dedup keyed by ISO week so retries
 * within Monday don't fan out duplicates.
 */
const handleFeaturedAnalytics = withCronAlerting(
  "featured-analytics",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();
    const now = Date.now();
    const thisWeekStart = new Date(now - 7 * DAY_MS);
    const lastWeekStart = new Date(now - 14 * DAY_MS);
    const lastWeekEnd = thisWeekStart;

    const nurseQuery = supabase
      .from("nurse_profiles")
      .select(
        `
      user_id,
      users!inner (email, first_name, is_deleted, is_suspended)
    `,
      )
      .eq("tier", "featured");
    const { data: featured, error } = await applyVisibleNurseFilter(nurseQuery);

    if (error) {
      console.error("[cron featured-analytics] query failed:", error.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    type Row = {
      user_id: string;
      users: {
        email: string;
        first_name: string | null;
        is_deleted: boolean;
        is_suspended: boolean;
      };
    };

    const todayBucket = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of (featured ?? []) as unknown as Row[]) {
      const thisWeek = await sumAnalytics(
        supabase,
        row.user_id,
        thisWeekStart,
        new Date(now),
      );
      const lastWeek = await sumAnalytics(
        supabase,
        row.user_id,
        lastWeekStart,
        lastWeekEnd,
      );
      const total =
        thisWeek.profileViews +
        thisWeek.saves +
        thisWeek.reveals +
        lastWeek.profileViews +
        lastWeek.saves +
        lastWeek.reveals;
      if (total === 0) {
        skipped++;
        continue;
      }

      const user = row.users;
      const outcome = await sendOnce(
        supabase,
        {
          recipientUserId: row.user_id,
          emailType: "featured_analytics",
          dedupKey: `week_${todayBucket}`,
        },
        () =>
          sendFeaturedAnalyticsEmail({
            to: user.email,
            firstName: user.first_name ?? undefined,
            thisWeek,
            lastWeek,
          }),
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
        {
          error: "Every featured analytics email failed to send",
          skipped,
          failed,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, sent, skipped, failed });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleFeaturedAnalytics(request);
}

async function sumAnalytics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  nurseUserId: string,
  start: Date,
  end: Date,
): Promise<WeekSums> {
  // A failed read is NOT "no activity that week" (#847). These sums go into
  // an email telling a Featured nurse how her profile did, so an empty answer
  // reports a week of nothing to somebody who paid for the placement, and the
  // week-on-week comparison beside it is computed from the same zero.
  const data = await unwrapOrThrow(
    supabase
      .from("nurse_analytics")
      .select("profile_views, saves, reveals")
      .eq("nurse_user_id", nurseUserId)
      .gte("date", start.toISOString().slice(0, 10))
      .lt("date", end.toISOString().slice(0, 10)),
    "one week of a nurse's analytics",
  );

  const sum = { profileViews: 0, saves: 0, reveals: 0 };
  for (const r of (data ?? []) as Array<{
    profile_views: number;
    saves: number;
    reveals: number;
  }>) {
    sum.profileViews += r.profile_views;
    sum.saves += r.saves;
    sum.reveals += r.reveals;
  }
  return sum;
}
