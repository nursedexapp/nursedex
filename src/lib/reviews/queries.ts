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
