import { createClient } from "@/lib/supabase/server";
import { getSignedPhotoUrl } from "./photos";

/**
 * Shape returned by getNurseBySlug for rendering public profiles.
 * Combines user + nurse_profiles data.
 */
export interface PublicNurseProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  slug: string;
  credential: string;
  license_number: string | null;
  care_types: string[];
  primary_care_type: string | null;
  skills: string[];
  gender: string | null;
  years_experience: number | null;
  languages: string[];
  bio: string | null;
  photos: string[];
  rate_min: number | null;
  rate_max: number | null;
  has_transportation: boolean;
  covid_vaccinated: boolean | null;
  care_philosophy: string | null;
  additional_certs: string[];
  availability_commitment: string[];
  time_slots: string[];
  travel_radius_miles: number | null;
  tier: string;
  verification_status: string;
  is_available: boolean;
  unavailable_visibility: string | null;
  profile_completeness: number;
  avg_rating: number | null;
  review_count: number;
  has_photo: boolean;
  is_seed: boolean;
  zip_code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  communication_preference: string | null;
}

/**
 * Fetch a verified nurse profile by slug.
 * Returns null if the slug doesn't match a verified (or seed) nurse.
 */
export async function getNurseBySlug(
  slug: string,
): Promise<PublicNurseProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      slug,
      credential,
      license_number,
      care_types,
      primary_care_type,
      skills,
      gender,
      years_experience,
      languages,
      bio,
      photos,
      rate_min,
      rate_max,
      has_transportation,
      covid_vaccinated,
      care_philosophy,
      additional_certs,
      availability_commitment,
      time_slots,
      travel_radius_miles,
      tier,
      verification_status,
      is_available,
      unavailable_visibility,
      profile_completeness,
      avg_rating,
      review_count,
      has_photo,
      is_seed,
      users!inner (
        first_name,
        last_name,
        zip_code,
        email,
        phone,
        communication_preference
      )
    `,
    )
    .eq("slug", slug)
    .eq("verification_status", "verified")
    .eq("users.is_deleted", false)
    .eq("users.is_suspended", false)
    .single();

  if (error || !data) return null;

  const users = data.users as unknown as {
    first_name: string;
    last_name: string;
    zip_code: string | null;
    email: string;
    phone: string | null;
    communication_preference: string | null;
  };

  return {
    user_id: data.user_id,
    first_name: users.first_name ?? "",
    last_name: users.last_name ?? "",
    slug: data.slug,
    credential: data.credential,
    license_number: data.license_number,
    care_types: data.care_types,
    primary_care_type: data.primary_care_type,
    skills: data.skills,
    gender: data.gender,
    years_experience: data.years_experience,
    languages: data.languages,
    bio: data.bio,
    photos: data.photos,
    rate_min: data.rate_min,
    rate_max: data.rate_max,
    has_transportation: data.has_transportation,
    covid_vaccinated: data.covid_vaccinated,
    care_philosophy: data.care_philosophy,
    additional_certs: data.additional_certs,
    availability_commitment: data.availability_commitment,
    time_slots: data.time_slots,
    travel_radius_miles: data.travel_radius_miles,
    tier: data.tier,
    verification_status: data.verification_status,
    is_available: data.is_available,
    unavailable_visibility: data.unavailable_visibility,
    profile_completeness: data.profile_completeness,
    avg_rating: data.avg_rating,
    review_count: data.review_count,
    has_photo: data.has_photo,
    is_seed: data.is_seed,
    zip_code: users.zip_code,
    contact_email: users.email,
    contact_phone: users.phone,
    communication_preference: users.communication_preference,
  };
}

/**
 * Check if a slug has a redirect to a new slug.
 * Returns the new slug or null.
 */
export async function getSlugRedirect(
  slug: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("slug_redirects")
    .select("new_slug")
    .eq("old_slug", slug)
    .single();

  return data?.new_slug ?? null;
}

/**
 * Calculate distance in miles between two zip codes using the zip_codes table.
 * Returns null if either zip code is not found.
 */
export async function getDistanceBetweenZips(
  zip1: string,
  zip2: string,
): Promise<number | null> {
  if (!zip1 || !zip2 || zip1 === zip2) return zip1 === zip2 ? 0 : null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("zip_codes")
    .select("zip, latitude, longitude")
    .in("zip", [zip1, zip2]);

  if (!data || data.length < 2) return null;

  const z1 = data.find((z) => z.zip === zip1);
  const z2 = data.find((z) => z.zip === zip2);
  if (!z1 || !z2) return null;

  // Haversine formula (matches DB function calculate_distance)
  const R = 3959; // Earth radius in miles
  const dLat = toRad(z2.latitude - z1.latitude);
  const dLon = toRad(z2.longitude - z1.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(z1.latitude)) *
      Math.cos(toRad(z2.latitude)) *
      Math.sin(dLon / 2) ** 2;
  const distance = R * 2 * Math.asin(Math.sqrt(a));

  return Math.round(distance);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Get signed photo URLs for a nurse's photos array.
 */
export async function getPublicPhotoUrls(
  photos: string[],
): Promise<(string | null)[]> {
  if (photos.length === 0) return [];
  return Promise.all(photos.map((path) => getSignedPhotoUrl(path)));
}

/**
 * Get the license verification URL for a credential.
 */
export async function getLicenseVerifyUrl(
  credential: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("license_verification_urls")
    .select("url")
    .eq("credential", credential)
    .eq("state", "NY")
    .single();

  return data?.url ?? null;
}
