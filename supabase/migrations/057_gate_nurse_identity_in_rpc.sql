-- ============================================================
-- Gate nurse identity (last name, license number) inside the public RPC (#381)
-- ============================================================
-- get_public_nurse_by_slug is SECURITY DEFINER and GRANTed to anon, so it is
-- callable directly with the anon key that ships in the client bundle:
--
--   POST /rest/v1/rpc/get_public_nurse_by_slug  { "p_slug": "..." }
--
-- Migration 041 had it return last_name and license_number unconditionally.
-- The only redaction was in the profile page's server component, which runs
-- AFTER the RPC returns and so never protected the raw endpoint. Anyone could
-- read either field for any verified nurse (AUD-163, confirmed).
--
-- This redefines the function to compute the caller's entitlement from
-- auth.uid() and null both fields when the caller is not entitled, mirroring
-- get_nurse_contact (migration 015) and canSeeNurseIdentity in
-- src/lib/profile/identity.ts. Entitled = the nurse themselves, an admin, a
-- family with an active (or past_due grace) Family Access subscription, or a
-- family holding an unexpired reveal for this nurse.
--
-- The RETURNS TABLE shape and the anon/authenticated grants are unchanged: the
-- function now self-gates, so it is safe to remain anon-callable. The page's
-- redaction stays as defense in depth. Proven by
-- src/lib/__tests__/nurse-identity-gating.test.ts, which calls the RPC as anon,
-- as an unentitled family, and as entitled callers.
--
-- license_number is nullable (only LPN/RN/NP carry one; CNA is certified, HHA
-- neither), so nulling it for the unentitled changes nothing for those rows.

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_nurse_id uuid;
  v_role user_role;
  v_can_see_identity boolean := false;
BEGIN
  -- Resolve the nurse first, applying the same visibility filter as before.
  SELECT np.user_id INTO v_nurse_id
  FROM public.nurse_profiles np
  JOIN public.users u ON u.id = np.user_id
  WHERE np.slug = p_slug
    AND np.verification_status = 'verified'
    AND np.is_hidden = false
    AND u.is_deleted = false
    AND u.is_suspended = false;

  IF v_nurse_id IS NULL THEN
    RETURN; -- no matching public nurse; empty result, same as before
  END IF;

  IF v_caller IS NOT NULL THEN
    SELECT role INTO v_role FROM public.users WHERE id = v_caller;

    v_can_see_identity :=
      v_caller = v_nurse_id
      OR v_role IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.user_id = v_caller
          AND s.plan_type = 'family_access'
          AND s.status IN ('active', 'past_due')
      )
      OR EXISTS (
        SELECT 1 FROM public.reveals r
        WHERE r.family_user_id = v_caller
          AND r.nurse_user_id = v_nurse_id
          AND (r.access_expires_at IS NULL OR r.access_expires_at > now())
      );
  END IF;

  RETURN QUERY
  SELECT
    np.user_id,
    np.slug,
    np.credential,
    CASE WHEN v_can_see_identity THEN np.license_number ELSE NULL END,
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
    CASE WHEN v_can_see_identity THEN u.last_name ELSE NULL END,
    u.zip_code
  FROM public.nurse_profiles np
  JOIN public.users u ON u.id = np.user_id
  WHERE np.user_id = v_nurse_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_nurse_by_slug(text)
  TO anon, authenticated;
