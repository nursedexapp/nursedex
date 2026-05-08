-- ============================================================
-- Public nurse access: anon-readable profile + gated contact RPC
-- ============================================================
-- The public profile page and search rely on joining nurse_profiles
-- to users for first_name / last_name / zip_code, but RLS on users
-- only exposes id = auth.uid() rows (and admins). That breaks the
-- join for anon and authenticated family viewers, leaving every
-- /nurses/[slug] rendering as "Nurse Not Found" and the search
-- empty state for everyone except admins.
--
-- Fix: a SECURITY DEFINER RPC that returns the public-safe shape
-- for a verified nurse by slug, and a second RPC that returns the
-- caller-gated contact info (only the nurse themselves, an admin,
-- or a family with an active reveal can read it).

-- ─── get_public_nurse_by_slug ──────────────────────────────
-- Returns the verified nurse profile keyed by slug. Anyone can
-- call it; rows are filtered to verification_status='verified'
-- and non-deleted, non-suspended users. Returns no rows otherwise.

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
    AND u.is_deleted = false
    AND u.is_suspended = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_nurse_by_slug(text)
  TO anon, authenticated;

-- ─── get_nurse_contact ─────────────────────────────────────
-- Returns the contact triple (email, phone, communication_preference)
-- only when the caller is allowed to see it: the nurse themselves,
-- an admin / super_admin, or a family with an active reveal that
-- has not expired. Returns no rows for anyone else.

CREATE OR REPLACE FUNCTION public.get_nurse_contact(p_nurse_user_id uuid)
RETURNS TABLE (
  email text,
  phone text,
  communication_preference communication_preference
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role user_role;
  v_has_reveal boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_caller;

  IF v_caller = p_nurse_user_id
     OR v_role IN ('admin', 'super_admin') THEN
    RETURN QUERY
      SELECT u.email, u.phone, u.communication_preference
      FROM public.users u
      WHERE u.id = p_nurse_user_id
        AND u.is_deleted = false
        AND u.is_suspended = false;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reveals r
    WHERE r.family_user_id = v_caller
      AND r.nurse_user_id = p_nurse_user_id
      AND (r.access_expires_at IS NULL OR r.access_expires_at > now())
  ) INTO v_has_reveal;

  IF v_has_reveal THEN
    RETURN QUERY
      SELECT u.email, u.phone, u.communication_preference
      FROM public.users u
      WHERE u.id = p_nurse_user_id
        AND u.is_deleted = false
        AND u.is_suspended = false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nurse_contact(uuid)
  TO authenticated;
