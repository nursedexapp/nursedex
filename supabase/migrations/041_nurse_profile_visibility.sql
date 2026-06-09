-- ============================================================
-- Nurse profile visibility flag
-- ============================================================
-- A dedicated is_hidden flag to take a nurse profile offline without
-- abusing verification_status. Hidden profiles drop out of search, the
-- public profile page, the sitemap, saved lists, and reveals, while keeping
-- their data and verification state intact. Used to park the demo seed
-- nurses at launch (see scripts/launch-cleanup.ts) and available for future
-- takedowns or nurse-requested pauses.

ALTER TABLE public.nurse_profiles
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Public read must also exclude hidden profiles, so a hidden-but-verified
-- row is not reachable even through a direct PostgREST query.
DROP POLICY IF EXISTS nurse_profiles_select_public ON public.nurse_profiles;
CREATE POLICY nurse_profiles_select_public ON public.nurse_profiles
  FOR SELECT USING (
    verification_status = 'verified'
    AND is_hidden = false
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nurse_profiles.user_id
      AND (u.is_deleted = true OR u.is_suspended = true)
    )
  );

-- The public profile RPC is SECURITY DEFINER (it bypasses RLS), so it needs
-- the same filter. Identical to migration 015 plus `AND np.is_hidden = false`.
CREATE OR REPLACE FUNCTION public.get_public_nurse_by_slug(p_slug text)
RETURNS TABLE (
  user_id uuid,
  slug text,
  credential credential,
  license_number text,
  care_types care_type[],
  primary_care_type care_type,
  skills skill[],
  gender gender,
  years_experience integer,
  languages text[],
  bio text,
  photos text[],
  rate_min numeric,
  rate_max numeric,
  has_transportation boolean,
  covid_vaccinated boolean,
  care_philosophy text,
  additional_certs text[],
  availability_commitment availability_commitment[],
  time_slots time_slot[],
  travel_radius_miles integer,
  tier nurse_tier,
  verification_status verification_status,
  is_available boolean,
  unavailable_visibility unavailable_visibility,
  profile_completeness integer,
  avg_rating numeric,
  review_count integer,
  has_photo boolean,
  is_seed boolean,
  first_name text,
  last_name text,
  zip_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    np.user_id,
    np.slug,
    np.credential,
    np.license_number,
    np.care_types,
    np.primary_care_type,
    np.skills,
    np.gender,
    np.years_experience,
    np.languages,
    np.bio,
    np.photos,
    np.rate_min,
    np.rate_max,
    np.has_transportation,
    np.covid_vaccinated,
    np.care_philosophy,
    np.additional_certs,
    np.availability_commitment,
    np.time_slots,
    np.travel_radius_miles,
    np.tier,
    np.verification_status,
    np.is_available,
    np.unavailable_visibility,
    np.profile_completeness,
    np.avg_rating,
    np.review_count,
    np.has_photo,
    np.is_seed,
    u.first_name,
    u.last_name,
    u.zip_code
  FROM public.nurse_profiles np
  JOIN public.users u ON u.id = np.user_id
  WHERE np.slug = p_slug
    AND np.verification_status = 'verified'
    AND np.is_hidden = false
    AND u.is_deleted = false
    AND u.is_suspended = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_nurse_by_slug(text)
  TO anon, authenticated;
