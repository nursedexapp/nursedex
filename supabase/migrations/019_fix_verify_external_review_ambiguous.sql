-- verify_external_review always failed with 42702 "column reference
-- nurse_user_id is ambiguous": the function's RETURNS TABLE output columns
-- (nurse_user_id, reviewer_name, rating) collided with the unqualified
-- reviews.* columns in its SELECT list, so every external-review email
-- verification threw and the verify page showed "Link not valid". Qualify
-- the reviews columns with a table alias to remove the ambiguity. Logic is
-- otherwise unchanged.

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
  SELECT r.id, r.nurse_user_id, r.reviewer_name, r.rating, r.reviewer_email
    INTO v_review_id, v_nurse_user_id, v_reviewer_name, v_rating, v_email
  FROM public.reviews r
  WHERE r.external_token = p_token
    AND r.is_external = true
    AND r.email_verified = false
    AND (r.verification_expires_at IS NULL OR r.verification_expires_at > now());

  IF v_review_id IS NULL THEN
    RAISE EXCEPTION 'Verification link is invalid or has expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.email = v_email
  LIMIT 1;

  UPDATE public.reviews
  SET
    email_verified = true,
    reviewer_user_id = v_user_id
  WHERE id = v_review_id;

  RETURN QUERY SELECT v_review_id, v_nurse_user_id, v_reviewer_name, v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_external_review(uuid) TO anon, authenticated;
