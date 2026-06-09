import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
  // saved_nurses.nurse_user_id has its foreign key to users, not
  // nurse_profiles, so PostgREST can't embed nurse_profiles directly off
  // saved_nurses (it errors with PGRST200). Fetch the saved rows first, then
  // load the cards from nurse_profiles with the users!inner embed, the same
  // shape search.ts uses. Service role is required because RLS on users hides
  // other people's rows from the family; cards never render contact fields.
  const supabase = createServiceRoleClient();

  const { data: savedRows, error: savedError } = await supabase
    .from("saved_nurses")
    .select("nurse_user_id, saved_at")
    .eq("family_user_id", familyUserId)
    .order("saved_at", { ascending: false });

  if (savedError || !savedRows || savedRows.length === 0) return [];

  const nurseIds = savedRows.map((r) => r.nurse_user_id);

  const { data, error } = await supabase
    .from("nurse_profiles")
    .select(
      `
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
    `,
    )
    .in("user_id", nurseIds)
    .eq("verification_status", "verified")
    .eq("is_hidden", false)
    .eq("users.is_deleted", false)
    .eq("users.is_suspended", false);

  if (error || !data) return [];

  type ProfileRow = {
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
  };

  const byId = new Map<string, ProfileRow>();
  for (const p of data as unknown as ProfileRow[]) byId.set(p.user_id, p);

  // Iterate saved rows (already newest first) so card order follows saved_at.
  const cards: NurseSearchCard[] = [];
  for (const row of savedRows) {
    const n = byId.get(row.nurse_user_id);
    if (!n) continue;
    const u = n.users;
    if (!u) continue;
    // Drop hidden-when-unavailable nurses (verified + not deleted/suspended
    // are already enforced in the query).
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
