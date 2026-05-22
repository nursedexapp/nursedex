-- Fix: check_reveal_rate_limit returned NULL for a family with no
-- rate_limit_reveals row for the current day (their first reveal of the
-- day). `SELECT ... INTO` sets the variable to NULL when no row matches,
-- so the per-row COALESCE never ran, and `allowed = NULL < cap` evaluated
-- to NULL. The app read that as "not allowed" and wrongly blocked the
-- first reveal of every day. COALESCE the variable after the SELECT so a
-- missing row counts as zero.

CREATE OR REPLACE FUNCTION public.check_reveal_rate_limit(
  p_family_user_id uuid
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  needs_captcha boolean
) AS $$
DECLARE
  v_count integer;
  v_captcha_threshold integer := 10;
  v_hard_cap integer := 25;
BEGIN
  SELECT rl.reveal_count INTO v_count
  FROM public.rate_limit_reveals rl
  WHERE rl.family_user_id = p_family_user_id
    AND rl.date = CURRENT_DATE;

  v_count := COALESCE(v_count, 0);

  RETURN QUERY SELECT
    v_count < v_hard_cap,
    v_count,
    v_count >= v_captcha_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
