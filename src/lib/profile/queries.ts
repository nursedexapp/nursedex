import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSignedPhotoUrl } from "./photos";

import { unwrapOrThrow } from "@/lib/db/results";
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
 * Returns null if the slug doesn't match a verified nurse.
 *
 * Uses a SECURITY DEFINER RPC because RLS on public.users only
 * exposes id = auth.uid() rows, which would otherwise filter out
 * the join for anon and family viewers. Contact info (email,
 * phone, communication_preference) is intentionally NOT returned
 * here. Callers that need it must call getNurseContactInfo, which
 * gates on reveal / admin / self.
 */
export async function getNurseBySlug(
  slug: string,
): Promise<PublicNurseProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_public_nurse_by_slug", { p_slug: slug })
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    user_id: string;
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
    first_name: string | null;
    last_name: string | null;
    zip_code: string | null;
  };

  return {
    user_id: row.user_id,
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    slug: row.slug,
    credential: row.credential,
    license_number: row.license_number,
    care_types: row.care_types,
    primary_care_type: row.primary_care_type,
    skills: row.skills,
    gender: row.gender,
    years_experience: row.years_experience,
    languages: row.languages,
    bio: row.bio,
    photos: row.photos,
    rate_min: row.rate_min,
    rate_max: row.rate_max,
    has_transportation: row.has_transportation,
    covid_vaccinated: row.covid_vaccinated,
    care_philosophy: row.care_philosophy,
    additional_certs: row.additional_certs,
    availability_commitment: row.availability_commitment,
    time_slots: row.time_slots,
    travel_radius_miles: row.travel_radius_miles,
    tier: row.tier,
    verification_status: row.verification_status,
    is_available: row.is_available,
    unavailable_visibility: row.unavailable_visibility,
    profile_completeness: row.profile_completeness,
    avg_rating: row.avg_rating,
    review_count: row.review_count,
    has_photo: row.has_photo,
    is_seed: row.is_seed,
    zip_code: row.zip_code,
    contact_email: null,
    contact_phone: null,
    communication_preference: null,
  };
}

/**
 * Privileged variant of getNurseBySlug for callers who need to see a
 * profile regardless of verification status: admins reviewing the
 * verification queue, and nurses previewing their own pending profile.
 *
 * Uses the service-role client so the verification filter on the
 * public RPC doesn't apply. The page calling this is responsible for
 * gating who can request the unfiltered view.
 */
export async function getNurseBySlugUnfiltered(
  slug: string,
): Promise<PublicNurseProfile | null> {
  const supabase = createServiceRoleClient();

  // eslint-disable-next-line local/require-visible-nurse-filter -- this function exists to return a profile regardless of verification status (admins reviewing the queue, a nurse previewing their own pending profile), so applying the visible-nurse filter here would defeat its purpose. The caller is responsible for gating who may request the unfiltered view; see the docstring above.
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
      users!inner(first_name, last_name, zip_code)
    `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    user_id: string;
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
    users: {
      first_name: string | null;
      last_name: string | null;
      zip_code: string | null;
    };
  };

  return {
    user_id: row.user_id,
    first_name: row.users.first_name ?? "",
    last_name: row.users.last_name ?? "",
    slug: row.slug,
    credential: row.credential,
    license_number: row.license_number,
    care_types: row.care_types,
    primary_care_type: row.primary_care_type,
    skills: row.skills,
    gender: row.gender,
    years_experience: row.years_experience,
    languages: row.languages,
    bio: row.bio,
    photos: row.photos,
    rate_min: row.rate_min,
    rate_max: row.rate_max,
    has_transportation: row.has_transportation,
    covid_vaccinated: row.covid_vaccinated,
    care_philosophy: row.care_philosophy,
    additional_certs: row.additional_certs,
    availability_commitment: row.availability_commitment,
    time_slots: row.time_slots,
    travel_radius_miles: row.travel_radius_miles,
    tier: row.tier,
    verification_status: row.verification_status,
    is_available: row.is_available,
    unavailable_visibility: row.unavailable_visibility,
    profile_completeness: row.profile_completeness,
    avg_rating: row.avg_rating,
    review_count: row.review_count,
    has_photo: row.has_photo,
    is_seed: row.is_seed,
    zip_code: row.users.zip_code,
    contact_email: null,
    contact_phone: null,
    communication_preference: null,
  };
}

/**
 * Fetch contact triple for a nurse, gated server-side to: the
 * nurse themselves, an admin, or a family with an active reveal.
 * Returns nulls for everyone else (and for anon callers).
 */
export async function getNurseContactInfo(nurseUserId: string): Promise<{
  email: string | null;
  phone: string | null;
  communication_preference: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_nurse_contact", { p_nurse_user_id: nurseUserId })
    .maybeSingle();

  if (error || !data) {
    return { email: null, phone: null, communication_preference: null };
  }

  const row = data as {
    email: string | null;
    phone: string | null;
    communication_preference: string | null;
  };
  return {
    email: row.email,
    phone: row.phone,
    communication_preference: row.communication_preference,
  };
}

/**
 * Check if a slug has a redirect to a new slug.
 * Returns the new slug or null.
 */
export async function getSlugRedirect(slug: string): Promise<string | null> {
  const supabase = await createClient();

  const data = await unwrapOrThrow(
    supabase
      .from("slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .single(),
    "slug_redirects (getSlugRedirect)",
  );

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

  const data = await unwrapOrThrow(
    supabase
      .from("zip_codes")
      .select("zip, latitude, longitude")
      .in("zip", [zip1, zip2]),
    "zip_codes (getDistanceBetweenZips)",
  );

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

  const data = await unwrapOrThrow(
    supabase
      .from("license_verification_urls")
      .select("url")
      .eq("credential", credential)
      .eq("state", "NY")
      .single(),
    "license_verification_urls (getLicenseVerifyUrl)",
  );

  return data?.url ?? null;
}
