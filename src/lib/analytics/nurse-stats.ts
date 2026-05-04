import { createClient } from "@/lib/supabase/server";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyPoint {
  date: string;
  profileViews: number;
  saves: number;
  reveals: number;
}

export interface NurseStatsTotals {
  profileViews: number;
  saves: number;
  reveals: number;
}

export interface NurseStats {
  daily: DailyPoint[];
  thisWindow: NurseStatsTotals;
  priorWindow: NurseStatsTotals;
}

/**
 * 30-day stats for the nurse's analytics dashboard. Returns a daily
 * series (zero-filled across the full 30 days so the chart renders a
 * smooth line even on quiet days), plus aggregate totals for "this 30
 * days" vs "prior 30 days" so the page can show percent change.
 */
export async function getNurseStats(
  nurseUserId: string,
): Promise<NurseStats> {
  const supabase = await createClient();
  const now = Date.now();
  const priorStart = new Date(now - 60 * DAY_MS);

  const { data } = await supabase
    .from("nurse_analytics")
    .select("date, profile_views, saves, reveals")
    .eq("nurse_user_id", nurseUserId)
    .gte("date", priorStart.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  type Row = {
    date: string;
    profile_views: number;
    saves: number;
    reveals: number;
  };

  const byDate = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    byDate.set(r.date, r);
  }

  const daily: DailyPoint[] = [];
  const thisWindow: NurseStatsTotals = {
    profileViews: 0,
    saves: 0,
    reveals: 0,
  };
  const priorWindow: NurseStatsTotals = {
    profileViews: 0,
    saves: 0,
    reveals: 0,
  };

  for (let i = 30; i >= 1; i--) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const row = byDate.get(day);
    daily.push({
      date: day,
      profileViews: row?.profile_views ?? 0,
      saves: row?.saves ?? 0,
      reveals: row?.reveals ?? 0,
    });
  }
  // Aggregate the visible 30 days.
  for (const d of daily) {
    thisWindow.profileViews += d.profileViews;
    thisWindow.saves += d.saves;
    thisWindow.reveals += d.reveals;
  }
  // Aggregate the prior 30 days (days 31-60 ago).
  for (let i = 60; i >= 31; i--) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const row = byDate.get(day);
    if (!row) continue;
    priorWindow.profileViews += row.profile_views;
    priorWindow.saves += row.saves;
    priorWindow.reveals += row.reveals;
  }

  return { daily, thisWindow, priorWindow };
}

export interface CohortComparison {
  /** True when at least 5 other nurses share the cohort. */
  available: boolean;
  /** Cohort size, including the nurse themselves. */
  cohortSize: number;
  /** Median profile_views over 30 days for the cohort, excluding the nurse. */
  cohortMedianViews: number | null;
  /** Multiplier of nurse vs cohort median, e.g. 2.1 means "2.1x the median." Null when not available. */
  multiplier: number | null;
}

/**
 * Cohort = same credential + same primary_care_type. Requires at
 * least 5 nurses in the cohort (including this one) to surface a
 * comparison; smaller cohorts produce too noisy a number.
 */
export async function getCohortComparison(
  nurseUserId: string,
  thirtyDayProfileViews: number,
): Promise<CohortComparison> {
  const supabase = await createClient();
  const now = Date.now();
  const since = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);

  const { data: me } = await supabase
    .from("nurse_profiles")
    .select("credential, primary_care_type")
    .eq("user_id", nurseUserId)
    .maybeSingle();
  if (!me?.credential || !me.primary_care_type) {
    return {
      available: false,
      cohortSize: 0,
      cohortMedianViews: null,
      multiplier: null,
    };
  }

  const { data: cohort } = await supabase
    .from("nurse_profiles")
    .select("user_id")
    .eq("credential", me.credential)
    .eq("primary_care_type", me.primary_care_type)
    .eq("verification_status", "verified");
  type CohortRow = { user_id: string };
  const cohortIds = ((cohort ?? []) as CohortRow[]).map((c) => c.user_id);
  if (cohortIds.length < 5) {
    return {
      available: false,
      cohortSize: cohortIds.length,
      cohortMedianViews: null,
      multiplier: null,
    };
  }

  const others = cohortIds.filter((id) => id !== nurseUserId);
  const { data: rows } = await supabase
    .from("nurse_analytics")
    .select("nurse_user_id, profile_views")
    .in("nurse_user_id", others)
    .gte("date", since);
  type AnalyticsRow = { nurse_user_id: string; profile_views: number };
  const sums = new Map<string, number>();
  for (const r of (rows ?? []) as AnalyticsRow[]) {
    sums.set(r.nurse_user_id, (sums.get(r.nurse_user_id) ?? 0) + r.profile_views);
  }
  // Include zero-activity nurses so the median doesn't skew toward
  // active ones; every cohort member contributes a number.
  const series = others.map((id) => sums.get(id) ?? 0).sort((a, b) => a - b);
  const median = series.length === 0 ? 0 : medianOf(series);

  const multiplier =
    median > 0 ? Math.round((thirtyDayProfileViews / median) * 10) / 10 : null;

  return {
    available: true,
    cohortSize: cohortIds.length,
    cohortMedianViews: median,
    multiplier,
  };
}

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return Math.round(((sorted[n / 2 - 1] + sorted[n / 2]) / 2) * 10) / 10;
}

export function percentChange(
  current: number,
  prior: number,
): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 100);
}
