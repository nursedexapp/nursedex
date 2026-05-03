import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendFeaturedAnalyticsEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

interface WeekSums {
  profileViews: number;
  saves: number;
  reveals: number;
}

/**
 * Monday 14:00 UTC. Sums each Featured nurse's nurse_analytics rows
 * for the last 7 days vs the previous 7 days, then emails them the
 * snapshot. Skips nurses with zero activity in both windows so we
 * don't ship a "0 vs 0" email. Dedup keyed by ISO week so retries
 * within Monday don't fan out duplicates.
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  const supabase = createServiceRoleClient();
  const now = Date.now();
  const thisWeekStart = new Date(now - 7 * DAY_MS);
  const lastWeekStart = new Date(now - 14 * DAY_MS);
  const lastWeekEnd = thisWeekStart;

  const { data: featured, error } = await supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      users:user_id (email, first_name, is_deleted, is_suspended)
    `,
    )
    .eq("tier", "featured")
    .eq("verification_status", "verified");

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
    } | null;
  };

  const todayBucket = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;

  for (const row of (featured ?? []) as unknown as Row[]) {
    if (!row.users || row.users.is_deleted || row.users.is_suspended) {
      skipped++;
      continue;
    }

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

    const ok = await shouldSendOnce(supabase, {
      recipientUserId: row.user_id,
      emailType: "featured_analytics",
      dedupKey: `week_${todayBucket}`,
    });
    if (!ok) {
      skipped++;
      continue;
    }

    await sendFeaturedAnalyticsEmail({
      to: row.users.email,
      firstName: row.users.first_name ?? undefined,
      thisWeek,
      lastWeek,
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent, skipped });
}

async function sumAnalytics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  nurseUserId: string,
  start: Date,
  end: Date,
): Promise<WeekSums> {
  const { data } = await supabase
    .from("nurse_analytics")
    .select("profile_views, saves, reveals")
    .eq("nurse_user_id", nurseUserId)
    .gte("date", start.toISOString().slice(0, 10))
    .lt("date", end.toISOString().slice(0, 10));

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
