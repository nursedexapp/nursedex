import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import type { NurseSearchCard } from "./search";

/**
 * Return the set of nurse_user_ids the current user has saved, out of a
 * given candidate list. Returns an empty set for non-family or anon viewers.
 */
export async function getSavedNurseIds(
  candidateNurseUserIds: string[],
): Promise<Set<string>> {
  if (candidateNurseUserIds.length === 0) return new Set();
  const user = await getCurrentUser();
  if (!user || user.role !== "family") return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_nurses")
    .select("nurse_user_id")
    .eq("family_user_id", user.id)
    .in("nurse_user_id", candidateNurseUserIds);

  return new Set((data ?? []).map((r) => r.nurse_user_id));
}

/**
 * Fetch the full list of nurses a family has saved, newest first.
 * Includes unavailable nurses (but not hidden or deleted ones).
 */
export async function getSavedNurses(
  familyUserId: string,
): Promise<NurseSearchCard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_nurses")
    .select(
      `
      saved_at,
      nurse_user_id,
      nurse:nurse_profiles!saved_nurses_nurse_user_id_fkey (
        user_id,
        slug,
        credential,
        primary_care_type,
        care_types,
        tier,
        has_photo,
        photos,
        avg_rating,
        review_count,
        is_available,
        unavailable_visibility,
        profile_completeness,
        years_experience,
        verification_status,
        users!inner (
          first_name,
          last_name,
          zip_code,
          communication_preference,
          is_deleted,
          is_suspended
        )
      )
    `,
    )
    .eq("family_user_id", familyUserId)
    .order("saved_at", { ascending: false });

  if (error || !data) return [];

  // The foreign-key selector ergonomics are awkward — Supabase returns
  // a single joined object per row.
  type Row = {
    saved_at: string;
    nurse_user_id: string;
    nurse: {
      user_id: string;
      slug: string;
      credential: string;
      primary_care_type: string | null;
      care_types: string[];
      tier: "free" | "featured";
      has_photo: boolean;
      photos: string[];
      avg_rating: number | null;
      review_count: number;
      is_available: boolean;
      unavailable_visibility: string | null;
      profile_completeness: number;
      years_experience: number | null;
      verification_status: string;
      users: {
        first_name: string | null;
        last_name: string | null;
        zip_code: string | null;
        communication_preference: string | null;
        is_deleted: boolean;
        is_suspended: boolean;
      } | null;
    } | null;
  };

  const cards: NurseSearchCard[] = [];
  for (const row of data as unknown as Row[]) {
    const n = row.nurse;
    if (!n) continue;
    const u = n.users;
    if (!u) continue;
    // Keep nurses that are still verified + usable. Drop deleted/suspended/hidden.
    if (u.is_deleted || u.is_suspended) continue;
    if (n.verification_status !== "verified") continue;
    if (!n.is_available && n.unavailable_visibility === "hidden") continue;

    cards.push({
      user_id: n.user_id,
      slug: n.slug,
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      credential: n.credential,
      primary_care_type: n.primary_care_type,
      care_types: n.care_types,
      tier: n.tier,
      has_photo: n.has_photo,
      photo_url: null,
      avg_rating: n.avg_rating,
      review_count: n.review_count,
      is_available: n.is_available,
      unavailable_visibility: n.unavailable_visibility,
      profile_completeness: n.profile_completeness,
      zip_code: u.zip_code,
      distance_miles: null,
      communication_preference: u.communication_preference,
      years_experience: n.years_experience,
    });

    // Attach signed photo URL if available.
    if (n.photos.length > 0) {
      try {
        const signed = await getSignedPhotoUrl(n.photos[0]);
        cards[cards.length - 1].photo_url = signed;
      } catch {
        // leave as null
      }
    }
  }

  return cards;
}
