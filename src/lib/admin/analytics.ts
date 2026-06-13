import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PRICING } from "@/lib/constants";
import { SEED_EMAIL_PATTERN } from "./seed";

export interface AnalyticsTotals {
  signups: { nurse: number; family: number; total: number };
  newSignupsLast7d: number;
  newSignupsLast30d: number;
  activeFeatured: number;
  activeFamilyAccess: number;
  /** MRR computed from active subs at our published prices, in dollars. */
  mrr: number;
  totalReveals: number;
  revealsLast30d: number;
  totalSaves: number;
  totalReviewsApproved: number;
  pendingVerifications: number;
  totalHires: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Demo nurse accounts seeded to populate the directory share this email
// prefix. They are real rows (kept so the directory isn't empty) but must
// not count as signups, or they inflate the nurse total by 15.
const SEED_EMAIL_PATTERN = "noreply+seed-%@nursedex.com";

export async function getAnalyticsTotals(): Promise<AnalyticsTotals> {
  // Super-admin-only aggregate dashboard (the page calls requireSuperAdmin).
  // Use the service-role client so the platform-wide counts don't depend on
  // every table having an admin RLS policy. The remote DB is missing
  // subscriptions_select_admin, which silently zeroed MRR and active
  // subscriptions under the RLS client even though the data exists.
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
    totalReveals,
    reveals30d,
    totalSaves,
    approvedReviews,
    pendingVerifications,
    totalHires,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "nurse")
      .eq("is_deleted", false)
      .not("email", "ilike", SEED_EMAIL_PATTERN),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "family")
      .eq("is_deleted", false)
      .not("email", "ilike", SEED_EMAIL_PATTERN),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .eq("is_deleted", false)
      .not("email", "ilike", SEED_EMAIL_PATTERN),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .eq("is_deleted", false)
      .not("email", "ilike", SEED_EMAIL_PATTERN),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_type", "nurse_featured")
      .in("status", ["active", "past_due"]),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_type", "family_access")
      .in("status", ["active", "past_due"]),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_type", "family_access")
      .eq("billing_interval", "year")
      .in("status", ["active", "past_due"]),
    supabase.from("reveals").select("id", { count: "exact", head: true }),
    supabase
      .from("reveals")
      .select("id", { count: "exact", head: true })
      .gte("revealed_at", thirtyDaysAgo),
    supabase.from("saved_nurses").select("id", { count: "exact", head: true }),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("nurse_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    supabase.from("hires").select("id", { count: "exact", head: true }),
  ]);

  const featured = activeFeatured.count ?? 0;
  const familyAccess = activeFamilyAccess.count ?? 0;
  const familyAnnual = activeFamilyAccessAnnual.count ?? 0;
  const familyMonthly = familyAccess - familyAnnual;
  // Annual Family Access contributes its yearly price normalized to a month.
  const mrr =
    featured * PRICING.NURSE_FEATURED_MONTHLY +
    familyMonthly * PRICING.FAMILY_ACCESS_MONTHLY +
    familyAnnual * (PRICING.FAMILY_ACCESS_ANNUAL / 12);

  return {
    signups: {
      nurse: nurseCount.count ?? 0,
      family: familyCount.count ?? 0,
      total: (nurseCount.count ?? 0) + (familyCount.count ?? 0),
    },
    newSignupsLast7d: new7d.count ?? 0,
    newSignupsLast30d: new30d.count ?? 0,
    activeFeatured: featured,
    activeFamilyAccess: familyAccess,
    mrr,
    totalReveals: totalReveals.count ?? 0,
    revealsLast30d: reveals30d.count ?? 0,
    totalSaves: totalSaves.count ?? 0,
    totalReviewsApproved: approvedReviews.count ?? 0,
    pendingVerifications: pendingVerifications.count ?? 0,
    totalHires: totalHires.count ?? 0,
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
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role")
    .in("role", ["admin", "super_admin"])
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

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
