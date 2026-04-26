import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import type { NurseSearchCard } from "@/lib/nurses/search";

export interface RevealedNurse extends NurseSearchCard {
  // The reveal's expiration date when set (i.e., the family has cancelled
  // their sub but is still in the 60-day window). Null means active access.
  access_expires_at: string | null;
  revealed_at: string;
}

/**
 * Fetch the family's revealed nurses, newest first.
 * Drops nurses that are deleted/suspended/unverified out of an abundance
 * of safety, even though the row exists.
 */
export async function getRevealedNurses(
  familyUserId: string,
  limit?: number,
): Promise<RevealedNurse[]> {
  const supabase = await createClient();

  let query = supabase
    .from("reveals")
    .select(
      `
      revealed_at,
      access_expires_at,
      nurse_user_id,
      nurse:nurse_profiles!reveals_nurse_user_id_fkey (
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
    .order("revealed_at", { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error || !data) return [];

  type Row = {
    revealed_at: string;
    access_expires_at: string | null;
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

  const out: RevealedNurse[] = [];
  for (const row of data as unknown as Row[]) {
    const n = row.nurse;
    if (!n || !n.users) continue;
    const u = n.users;
    if (u.is_deleted || u.is_suspended) continue;
    if (n.verification_status !== "verified") continue;

    let photo_url: string | null = null;
    if (n.photos.length > 0) {
      try {
        photo_url = await getSignedPhotoUrl(n.photos[0]);
      } catch {
        // leave null
      }
    }

    out.push({
      user_id: n.user_id,
      slug: n.slug,
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      credential: n.credential,
      primary_care_type: n.primary_care_type,
      care_types: n.care_types,
      tier: n.tier,
      has_photo: n.has_photo,
      photo_url,
      avg_rating: n.avg_rating,
      review_count: n.review_count,
      is_available: n.is_available,
      unavailable_visibility: n.unavailable_visibility,
      profile_completeness: n.profile_completeness,
      zip_code: u.zip_code,
      distance_miles: null,
      communication_preference: u.communication_preference,
      years_experience: n.years_experience,
      access_expires_at: row.access_expires_at,
      revealed_at: row.revealed_at,
    });
  }

  return out;
}
