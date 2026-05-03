-- ============================================================
-- External review links + email verification (Phase 5 Batch 2)
-- ============================================================
-- Each verified nurse gets one permanent shareable review link
-- (stored in nurse_review_links). When a past client visits the
-- link and submits the form, an unverified review row is inserted
-- and a per-review verification token is emailed to them. Clicking
-- the verification link flips email_verified=true; the review then
-- enters the normal moderation queue (status='pending').
--
-- Anonymous submission and verification go through SECURITY DEFINER
-- RPCs because the public form has no auth.uid().

CREATE TABLE IF NOT EXISTS public.nurse_review_links (
  nurse_user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  last_regenerated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nurse_review_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_links_owner ON public.nurse_review_links
  FOR ALL USING (nurse_user_id = auth.uid())
  WITH CHECK (nurse_user_id = auth.uid());

CREATE POLICY review_links_admin ON public.nurse_review_links
  FOR SELECT USING (public.is_admin());

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;

-- Resolve a share-link token to the nurse's basic public info.
-- Used by the public /reviews/[token] page to render the form header.
CREATE OR REPLACE FUNCTION public.resolve_review_link(p_token uuid)
RETURNS TABLE (nurse_user_id uuid, first_name text, last_name text, slug text)
SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT u.id, u.first_name, u.last_name, np.slug
  FROM public.nurse_review_links rl
  JOIN public.users u ON u.id = rl.nurse_user_id
  JOIN public.nurse_profiles np ON np.user_id = u.id
  WHERE rl.token = p_token
    AND u.is_deleted = false
    AND u.is_suspended = false
    AND np.verification_status = 'verified'
$$;

GRANT EXECUTE ON FUNCTION public.resolve_review_link(uuid)
  TO anon, authenticated;

-- Submit an external (anonymous) review. Caps unverified pending
-- external reviews at 5 per nurse to bound abuse via the share link.
-- Returns the new review id and the per-review verification token
-- so the caller can build the verification email.
CREATE OR REPLACE FUNCTION public.submit_external_review(
  p_link_token uuid,
  p_reviewer_name text,
  p_reviewer_email text,
  p_rating int,
  p_text text,
  p_testimonial_opt_in boolean,
  p_verification_expires_at timestamptz
)
RETURNS TABLE (review_id uuid, verification_token uuid)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nurse_user_id uuid;
  v_pending_count int;
  v_review_id uuid;
  v_verification_token uuid := gen_random_uuid();
  v_opt_in boolean;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_nurse_user_id
  FROM public.nurse_review_links rl
  JOIN public.users u ON u.id = rl.nurse_user_id
  JOIN public.nurse_profiles np ON np.user_id = u.id
  WHERE rl.token = p_link_token
    AND u.is_deleted = false
    AND u.is_suspended = false
    AND np.verification_status = 'verified';

  IF v_nurse_user_id IS NULL THEN
    RAISE EXCEPTION 'Review link is no longer valid' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.reviews
  WHERE nurse_user_id = v_nurse_user_id
    AND is_external = true
    AND email_verified = false;

  IF v_pending_count >= 5 THEN
    RAISE EXCEPTION 'Too many pending review requests; try again later'
      USING ERRCODE = '42501';
  END IF;

  v_opt_in := CASE WHEN p_rating >= 4 THEN p_testimonial_opt_in ELSE false END;

  INSERT INTO public.reviews (
    nurse_user_id,
    reviewer_name,
    reviewer_email,
    rating,
    text,
    is_external,
    external_token,
    email_verified,
    testimonial_opt_in,
    verification_expires_at,
    status
  ) VALUES (
    v_nurse_user_id,
    p_reviewer_name,
    p_reviewer_email,
    p_rating,
    p_text,
    true,
    v_verification_token,
    false,
    v_opt_in,
    p_verification_expires_at,
    'pending'
  )
  RETURNING id INTO v_review_id;

  RETURN QUERY SELECT v_review_id, v_verification_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_external_review(
  uuid, text, text, int, text, boolean, timestamptz
) TO anon, authenticated;

-- Verify a per-review email token. Flips email_verified=true and
-- opportunistically links reviewer_user_id to a NurseDex account if
-- one already exists for that email.
CREATE OR REPLACE FUNCTION public.verify_external_review(p_token uuid)
RETURNS TABLE (
  review_id uuid,
  nurse_user_id uuid,
  reviewer_name text,
  rating int
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_id uuid;
  v_nurse_user_id uuid;
  v_reviewer_name text;
  v_rating int;
  v_email text;
  v_user_id uuid;
BEGIN
  SELECT id, nurse_user_id, reviewer_name, rating, reviewer_email
    INTO v_review_id, v_nurse_user_id, v_reviewer_name, v_rating, v_email
  FROM public.reviews
  WHERE external_token = p_token
    AND is_external = true
    AND email_verified = false
    AND (verification_expires_at IS NULL OR verification_expires_at > now());

  IF v_review_id IS NULL THEN
    RAISE EXCEPTION 'Verification link is invalid or has expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id
  FROM public.users
  WHERE email = v_email
  LIMIT 1;

  UPDATE public.reviews
  SET
    email_verified = true,
    reviewer_user_id = v_user_id
  WHERE id = v_review_id;

  RETURN QUERY SELECT v_review_id, v_nurse_user_id, v_reviewer_name, v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_external_review(uuid)
  TO anon, authenticated;
