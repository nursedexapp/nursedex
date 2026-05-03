import "server-only";
import { createClient } from "@/lib/supabase/server";
import { compareVerificationQueueRows } from "./sla";

export interface AdminCounts {
  pendingVerifications: number;
  pendingReviews: number;
  pendingDisputes: number;
  removalRequests: number;
}

export async function getAdminCounts(): Promise<AdminCounts> {
  const supabase = await createClient();

  const [verifications, reviews, disputes, removals] = await Promise.all([
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
  ]);

  return {
    pendingVerifications: verifications.count ?? 0,
    pendingReviews: reviews.count ?? 0,
    pendingDisputes: disputes.count ?? 0,
    removalRequests: removals.count ?? 0,
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
 * "submitted_at" is the profile's updated_at — the cleanest proxy for
 * "when did this last enter the queue" without a dedicated audit
 * column. Resubmissions naturally bump it as the nurse changes data.
 */
export async function getVerificationQueue(): Promise<
  VerificationQueueItem[]
> {
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
