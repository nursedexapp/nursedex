import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Review } from "@/types/database";

/**
 * The current family user's existing platform review for a given nurse,
 * if any. Used to flip the dashboard CTA between "Leave a review" and
 * "Edit review (pending)" / "Request removal".
 */
export async function getFamilyReviewForNurse(
  familyUserId: string,
  nurseUserId: string,
): Promise<Review | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("reviewer_user_id", familyUserId)
    .eq("nurse_user_id", nurseUserId)
    .eq("is_external", false)
    .maybeSingle();

  return (data as Review | null) ?? null;
}

export interface ApprovedReview {
  id: string;
  rating: number;
  reviewer_name: string;
  text: string | null;
  is_external: boolean;
  is_disputed: boolean;
  nurse_response: string | null;
  nurse_response_at: string | null;
  created_at: string;
}

/**
 * Public-facing reviews for a nurse's profile, newest first. Includes
 * both approved and disputed reviews (per PRD: disputed reviews remain
 * visible during admin investigation). Filters out external rows that
 * haven't been email verified, defensively, even though those should
 * never reach approved/disputed in normal flow.
 */
export async function getApprovedReviews(
  nurseUserId: string,
): Promise<ApprovedReview[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      "id, rating, reviewer_name, text, is_external, email_verified, nurse_response, nurse_response_at, created_at, status",
    )
    .eq("nurse_user_id", nurseUserId)
    .in("status", ["approved", "disputed"])
    .order("created_at", { ascending: false });

  type Row = ApprovedReview & {
    email_verified: boolean;
    status: "approved" | "disputed";
  };
  return ((data ?? []) as Row[])
    .filter((r) => !r.is_external || r.email_verified)
    .map(({ email_verified: _ev, status, ...rest }) => ({
      ...rest,
      is_disputed: status === "disputed",
    }));
}

/**
 * The current nurse's own reviews. Includes pending so the dashboard
 * can show "X reviews waiting on moderation". Newest first.
 */
export async function getNurseReviews(
  nurseUserId: string,
): Promise<Review[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("nurse_user_id", nurseUserId)
    .order("created_at", { ascending: false });
  return (data as Review[] | null) ?? [];
}

/**
 * Bulk variant for the revealed-nurses dashboard: returns a map keyed by
 * nurse user_id so each card can render the right CTA without N+1 reads.
 */
export async function getFamilyReviewsByNurse(
  familyUserId: string,
  nurseUserIds: string[],
): Promise<Map<string, Review>> {
  if (nurseUserIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("reviewer_user_id", familyUserId)
    .eq("is_external", false)
    .in("nurse_user_id", nurseUserIds);

  const map = new Map<string, Review>();
  for (const row of (data ?? []) as Review[]) {
    map.set(row.nurse_user_id, row);
  }
  return map;
}
