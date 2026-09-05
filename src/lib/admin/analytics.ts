import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PRICING } from "@/lib/constants";
import { SEED_EMAIL_PATTERN } from "./seed";
import { optOutShare } from "./analytics-opt-out-share";

import { unwrapOrThrow, unwrapCountOrThrow } from "@/lib/db/results";
export interface AnalyticsTotals {
  signups: { nurse: number; family: number; total: number };
  newSignupsLast7d: number;
  newSignupsLast30d: number;
  activeFeatured: number;
  activeFamilyAccess: number;
  /** MRR computed from active subs at our published prices, in dollars. */
  mrr: number;
  /**
   * Subscription rows of any status. Lets an admin tell a genuinely empty
   * pipeline (0) from a broken Stripe webhook (rows expected but absent) when
   * MRR and the active counts both read 0.
   */
  totalSubscriptions: number;
  /**
   * updated_at of the most recently written subscription row, a proxy for the
   * last time the Stripe webhook landed. null when no subscription rows exist.
   */
  lastSubscriptionSyncAt: string | null;
  totalReveals: number;
  revealsLast30d: number;
  totalSaves: number;
  totalReviewsApproved: number;
  pendingVerifications: number;
  totalHires: number;
  /**
   * Accounts that asked not to be measured (#910). They are fully present here
   * and entirely absent from PostHog, so every funnel on that side silently
   * excludes them. Counted over the same population as `signups.total`, so the
   * share below is a share of something.
   */
  analyticsOptOuts: number;
  /**
   * That count as a proportion of total signups, or null when there is nobody
   * to be a proportion of. See analytics-opt-out-share.ts for why null rather
   * than zero.
   */
  analyticsOptOutShare: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAnalyticsTotals(): Promise<AnalyticsTotals> {
  // Super-admin-only aggregate dashboard (the page calls requireSuperAdmin).
  // Use the service-role client so the platform-wide counts don't depend on
  // every table having an admin RLS policy. The remote DB is missing
  // subscriptions_select_admin, which silently zeroed MRR and active
  // subscriptions under the RLS client even though the data exists.
  // Every one of these was read as `count ?? 0`, so a failed count rendered a
  // real ZERO on the dashboard: zero nurses, zero families, zero reveals, zero
  // hires, and an MRR of nothing, indistinguishable from a genuinely empty
  // product (#847, #991). Wrapped INSIDE the Promise.all rather than unpacked
  // after it, because an element of one has no destructuring for any rule to
  // inspect and no name for anything to check later.
  //
  // These throw. This is a server-only module behind a page render, so the
  // route's error boundary takes over, and an admin looking at an error screen
  // knows more than an admin looking at a product with no customers in it.
  const supabase = createServiceRoleClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString();

  const [
    nurseCount,
    familyCount,
    new7d,
    new30d,
    activeFeatured,
    activeFamilyAccess,
    activeFamilyAccessAnnual,
    totalSubscriptions,
    lastSubscriptionSync,
    totalReveals,
    reveals30d,
    totalSaves,
    approvedReviews,
    pendingVerifications,
    totalHires,
    analyticsOptOuts,
  ] = await Promise.all([
    unwrapCountOrThrow(
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "nurse")
        .eq("is_deleted", false)
        .not("email", "ilike", SEED_EMAIL_PATTERN),
      "the count of nurse signups",
    ),
    unwrapCountOrThrow(
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "family")
        .eq("is_deleted", false)
        .not("email", "ilike", SEED_EMAIL_PATTERN),
      "the count of family signups",
    ),
    unwrapCountOrThrow(
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo)
        .eq("is_deleted", false)
        .not("email", "ilike", SEED_EMAIL_PATTERN),
      "the count of signups in the last 7 days",
    ),
    unwrapCountOrThrow(
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo)
        .eq("is_deleted", false)
        .not("email", "ilike", SEED_EMAIL_PATTERN),
      "the count of signups in the last 30 days",
    ),
    unwrapCountOrThrow(
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_type", "nurse_featured")
        .in("status", ["active", "past_due"]),
      "the count of active Featured subscriptions",
    ),
    unwrapCountOrThrow(
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_type", "family_access")
        .in("status", ["active", "past_due"]),
      "the count of active Family Access subscriptions",
    ),
    unwrapCountOrThrow(
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_type", "family_access")
        .eq("billing_interval", "year")
        .in("status", ["active", "past_due"]),
      "the count of annual Family Access subscriptions",
    ),
    // Every subscription row, any status: the empty-vs-broken signal.
    unwrapCountOrThrow(
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true }),
      "the count of subscription rows of any status",
    ),
    // Most recent webhook write, as a freshness signal for the pipeline.
    unwrapOrThrow(
      supabase
        .from("subscriptions")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "the most recent subscription write, as a pipeline freshness signal",
    ),
    unwrapCountOrThrow(
      supabase.from("reveals").select("id", { count: "exact", head: true }),
      "the count of reveals",
    ),
    unwrapCountOrThrow(
      supabase
        .from("reveals")
        .select("id", { count: "exact", head: true })
        .gte("revealed_at", thirtyDaysAgo),
      "the count of reveals in the last 30 days",
    ),
    unwrapCountOrThrow(
      supabase
        .from("saved_nurses")
        .select("id", { count: "exact", head: true }),
      "the count of saved nurses",
    ),
    unwrapCountOrThrow(
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      "the count of approved reviews",
    ),
    unwrapCountOrThrow(
      // eslint-disable-next-line local/require-visible-nurse-filter -- counts the admin verification queue, which by definition holds profiles that are not yet verified and so are not publicly visible. This count feeds the admin dashboard, never a public surface.
      supabase
        .from("nurse_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("verification_status", "pending"),
      "the count of nurses awaiting verification",
    ),
    unwrapCountOrThrow(
      supabase.from("hires").select("id", { count: "exact", head: true }),
      "the count of hires",
    ),
    // The same filters as the signup counts, so the share below divides one
    // population by itself rather than two populations by each other (#910).
    // A count read over a different set would produce a share nothing on this
    // page could be judged against.
    unwrapCountOrThrow(
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("analytics_opt_out", true)
        .eq("is_deleted", false)
        .not("email", "ilike", SEED_EMAIL_PATTERN),
      "the count of accounts that opted out of analytics",
    ),
  ]);

  const featured = activeFeatured;
  const familyAccess = activeFamilyAccess;
  const familyAnnual = activeFamilyAccessAnnual;
  const familyMonthly = familyAccess - familyAnnual;
  // Annual Family Access contributes its yearly price normalized to a month.
  const mrr =
    featured * PRICING.NURSE_FEATURED_MONTHLY +
    familyMonthly * PRICING.FAMILY_ACCESS_MONTHLY +
    familyAnnual * (PRICING.FAMILY_ACCESS_ANNUAL / 12);

  return {
    signups: {
      nurse: nurseCount,
      family: familyCount,
      total: nurseCount + familyCount,
    },
    newSignupsLast7d: new7d,
    newSignupsLast30d: new30d,
    activeFeatured: featured,
    activeFamilyAccess: familyAccess,
    mrr,
    totalSubscriptions: totalSubscriptions,
    lastSubscriptionSyncAt:
      (lastSubscriptionSync?.updated_at as string | undefined) ?? null,
    totalReveals: totalReveals,
    revealsLast30d: reveals30d,
    totalSaves: totalSaves,
    totalReviewsApproved: approvedReviews,
    pendingVerifications: pendingVerifications,
    totalHires: totalHires,
    analyticsOptOuts,
    analyticsOptOutShare: optOutShare(
      analyticsOptOuts,
      nurseCount + familyCount,
    ),
  };
}

export interface AdminUserRow {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "admin" | "super_admin";
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const data = await unwrapOrThrow(
    supabase
      .from("users")
      .select("id, email, first_name, last_name, role")
      .in("role", ["admin", "super_admin"])
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    "users (getAdminUsers)",
  );

  return (
    (data ?? []) as Array<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      role: "admin" | "super_admin";
    }>
  ).map((u) => ({
    user_id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    role: u.role,
  }));
}
