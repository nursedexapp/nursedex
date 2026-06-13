import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPendingCommentCount } from "@/lib/comments/queries";
import { compareVerificationQueueRows } from "./sla";
import { SEED_EMAIL_PATTERN } from "./seed";

export interface AdminCounts {
  pendingVerifications: number;
  pendingReviews: number;
  pendingDisputes: number;
  removalRequests: number;
  pendingComments: number;
}

export async function getAdminCounts(): Promise<AdminCounts> {
  const supabase = await createClient();

  const [verifications, reviews, disputes, removals, pendingComments] =
    await Promise.all([
      supabase
        .from("nurse_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("verification_status", "pending"),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("email_verified", true),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "disputed"),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("removal_requested", true)
        .eq("status", "approved"),
      getPendingCommentCount(),
    ]);

  return {
    pendingVerifications: verifications.count ?? 0,
    pendingReviews: reviews.count ?? 0,
    pendingDisputes: disputes.count ?? 0,
    removalRequests: removals.count ?? 0,
    pendingComments,
  };
}

export interface VerificationQueueItem {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  slug: string;
  credential: string;
  license_number: string | null;
  tier: "free" | "featured";
  submitted_at: string;
  is_resubmission: boolean;
}

/**
 * Verifications queue, sorted by:
 *   1. Featured tier first (priority lane, 24hr SLA)
 *   2. Oldest submission first (FIFO within tier)
 *
 * "submitted_at" is the profile's updated_at, the cleanest proxy for
 * "when did this last enter the queue" without a dedicated audit
 * column. Resubmissions naturally bump it as the nurse changes data.
 */
export async function getVerificationQueue(): Promise<VerificationQueueItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      slug,
      credential,
      license_number,
      tier,
      updated_at,
      verification_rejected_reason,
      users!inner (
        first_name,
        last_name,
        email,
        is_deleted,
        is_suspended
      )
    `,
    )
    .eq("verification_status", "pending");

  if (!data) return [];

  type Row = {
    user_id: string;
    slug: string;
    credential: string;
    license_number: string | null;
    tier: "free" | "featured";
    updated_at: string;
    verification_rejected_reason: string | null;
    users: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      is_deleted: boolean;
      is_suspended: boolean;
    } | null;
  };

  const rows = (data as unknown as Row[])
    .filter((r) => r.users && !r.users.is_deleted && !r.users.is_suspended)
    .map((r) => ({
      user_id: r.user_id,
      first_name: r.users!.first_name,
      last_name: r.users!.last_name,
      email: r.users!.email,
      slug: r.slug,
      credential: r.credential,
      license_number: r.license_number,
      tier: r.tier,
      submitted_at: r.updated_at,
      is_resubmission: r.verification_rejected_reason !== null,
    }));

  rows.sort(compareVerificationQueueRows);
  return rows;
}

export interface AdminReviewRow {
  id: string;
  nurse_user_id: string;
  nurse_first_name: string | null;
  nurse_last_name: string | null;
  nurse_slug: string;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  text: string | null;
  is_external: boolean;
  status: "pending" | "approved" | "rejected" | "disputed";
  removal_requested: boolean;
  removal_reason: string | null;
  dispute_reason: string | null;
  dispute_text: string | null;
  created_at: string;
}

interface ReviewJoinRow {
  id: string;
  nurse_user_id: string;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  text: string | null;
  is_external: boolean;
  status: "pending" | "approved" | "rejected" | "disputed";
  removal_requested: boolean;
  removal_reason: string | null;
  dispute_reason: string | null;
  dispute_text: string | null;
  created_at: string;
  nurse: {
    first_name: string | null;
    last_name: string | null;
    nurse_profiles: {
      slug: string;
    } | null;
  } | null;
}

function shapeReviewRow(r: ReviewJoinRow): AdminReviewRow {
  return {
    id: r.id,
    nurse_user_id: r.nurse_user_id,
    nurse_first_name: r.nurse?.first_name ?? null,
    nurse_last_name: r.nurse?.last_name ?? null,
    nurse_slug: r.nurse?.nurse_profiles?.slug ?? "",
    reviewer_name: r.reviewer_name,
    reviewer_email: r.reviewer_email,
    rating: r.rating,
    text: r.text,
    is_external: r.is_external,
    status: r.status,
    removal_requested: r.removal_requested,
    removal_reason: r.removal_reason,
    dispute_reason: r.dispute_reason,
    dispute_text: r.dispute_text,
    created_at: r.created_at,
  };
}

// reviews.nurse_user_id has its foreign key to users, not nurse_profiles,
// so we embed users via that FK and reach the slug through nurse_profiles
// off users. Embedding nurse_profiles directly off reviews errors with
// PGRST200 and silently empties the moderation queues.
const REVIEW_JOIN_SELECT = `
  id, nurse_user_id, reviewer_name, reviewer_email, rating, text,
  is_external, status, removal_requested, removal_reason,
  dispute_reason, dispute_text, created_at,
  nurse:users!reviews_nurse_user_id_fkey (
    first_name,
    last_name,
    nurse_profiles!inner (slug)
  )
` as const;

export async function getPendingReviews(): Promise<AdminReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(REVIEW_JOIN_SELECT)
    .eq("status", "pending")
    .eq("email_verified", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as ReviewJoinRow[]).map(shapeReviewRow);
}

export async function getRemovalRequests(): Promise<AdminReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(REVIEW_JOIN_SELECT)
    .eq("removal_requested", true)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as ReviewJoinRow[]).map(shapeReviewRow);
}

export async function getDisputedReviews(): Promise<AdminReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(REVIEW_JOIN_SELECT)
    .eq("status", "disputed")
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as ReviewJoinRow[]).map(shapeReviewRow);
}

export interface FlaggedNurseRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  slug: string;
  bad_review_count: number;
  avg_rating: number | null;
}

/**
 * Nurses with 2+ approved 1-3 star reviews. Computed on the fly from
 * the reviews table, there's no persisted "flagged" flag, the count
 * is the gate.
 */
export async function getFlaggedNurses(): Promise<FlaggedNurseRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      `
      nurse_user_id,
      rating,
      status,
      nurse:users!reviews_nurse_user_id_fkey (
        first_name,
        last_name,
        nurse_profiles!inner (slug, avg_rating)
      )
    `,
    )
    .eq("status", "approved")
    .lte("rating", 3);

  type Row = {
    nurse_user_id: string;
    rating: number;
    status: string;
    nurse: {
      first_name: string | null;
      last_name: string | null;
      nurse_profiles: { slug: string; avg_rating: number | null } | null;
    } | null;
  };

  const counts = new Map<string, FlaggedNurseRow>();
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.nurse?.nurse_profiles) continue;
    const existing = counts.get(row.nurse_user_id);
    if (existing) {
      existing.bad_review_count += 1;
    } else {
      counts.set(row.nurse_user_id, {
        user_id: row.nurse_user_id,
        first_name: row.nurse.first_name,
        last_name: row.nurse.last_name,
        slug: row.nurse.nurse_profiles.slug,
        bad_review_count: 1,
        avg_rating: row.nurse.nurse_profiles.avg_rating,
      });
    }
  }

  return [...counts.values()]
    .filter((n) => n.bad_review_count >= 2)
    .sort((a, b) => b.bad_review_count - a.bad_review_count);
}

export interface AccountRow {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "nurse" | "family" | "admin" | "super_admin" | null;
  is_suspended: boolean;
  is_deleted: boolean;
  created_at: string;
}

export async function getAccounts(args: {
  query?: string;
  role?: "nurse" | "family";
  /**
   * false (default) lists live accounts; true lists soft-deleted accounts for
   * the admin Removed tab. The seeded demo accounts are excluded either way.
   */
  deleted?: boolean;
}): Promise<AccountRow[]> {
  const supabase = await createClient();

  // Always hide the seeded demo nurses (noreply+seed-*, also
  // nurse_profiles.is_seed); they exist to populate the public directory, not
  // to be managed here. is_deleted selects the live list or the Removed view.
  let q = supabase
    .from("users")
    .select(
      "id, email, first_name, last_name, role, is_suspended, is_deleted, created_at",
    )
    .eq("is_deleted", args.deleted ?? false)
    .not("email", "ilike", SEED_EMAIL_PATTERN)
    .order("created_at", { ascending: false })
    .limit(100);

  if (args.role) q = q.eq("role", args.role);

  if (args.query) {
    const safe = args.query.replace(/[,%]/g, "");
    q = q.or(
      `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`,
    );
  }

  const { data } = await q;

  return (
    (data ?? []) as Array<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      role: "nurse" | "family" | "admin" | "super_admin" | null;
      is_suspended: boolean;
      is_deleted: boolean;
      created_at: string;
    }>
  ).map((u) => ({
    user_id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    role: u.role,
    is_suspended: u.is_suspended,
    is_deleted: u.is_deleted,
    created_at: u.created_at,
  }));
}

export interface RateLimitFlaggedRow {
  family_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  consecutive_captcha_days: number;
  date: string;
}

/**
 * Family accounts with 3+ consecutive captcha-trigger days, the abuse
 * signal from Phase 4. Latest day per family.
 */
export async function getRateLimitFlagged(): Promise<RateLimitFlaggedRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rate_limit_reveals")
    .select(
      `
      family_user_id,
      consecutive_captcha_days,
      date,
      users:family_user_id ( email, first_name, last_name )
    `,
    )
    .gte("consecutive_captcha_days", 3)
    .order("date", { ascending: false });

  type Row = {
    family_user_id: string;
    consecutive_captcha_days: number;
    date: string;
    users: {
      email: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  };

  const seen = new Set<string>();
  const out: RateLimitFlaggedRow[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    if (seen.has(row.family_user_id)) continue;
    seen.add(row.family_user_id);
    if (!row.users) continue;
    out.push({
      family_user_id: row.family_user_id,
      email: row.users.email,
      first_name: row.users.first_name,
      last_name: row.users.last_name,
      consecutive_captcha_days: row.consecutive_captcha_days,
      date: row.date,
    });
  }
  return out;
}
