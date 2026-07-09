-- ============================================================
-- consume_reveal_rate_limit (issue #563)
-- ============================================================
-- The old bumpRateLimit() in src/lib/reveals/actions.ts read today's
-- reveal_count, added one in JavaScript, and wrote the result back. That
-- carried two races:
--
--   A. Lost update. Two concurrent bumps both read N and both write N + 1,
--      so the counter undercounts actual reveals.
--   B. Cap bypass. check_reveal_rate_limit runs before the reveal insert,
--      so a burst of concurrent requests all read the same pre-increment
--      count, all pass the cap check, and all insert. Fixing A alone leaves
--      B, and B is what actually lets a family exceed REVEALS_HARD_CAP.
--
-- This function closes both by making the increment itself the gate, in a
-- single statement. Concurrent INSERT ... ON CONFLICT statements serialize
-- on the (family_user_id, date) unique index from 001_schema.sql, so the
-- increment cannot lose an update, and the DO UPDATE ... WHERE guard
-- refuses to increment a row already at the cap. A caller that loses the
-- race gets allowed = false and inserts no reveal.
--
-- Only the service role calls this (the reveals server action runs it with
-- the service-role client, because rate_limit_reveals deliberately has no
-- INSERT policy for families). Postgres grants EXECUTE to PUBLIC by default
-- on every new function, so we revoke that and re-grant narrowly, following
-- the least-privilege convention established in 052_routine_execute_grants.

CREATE OR REPLACE FUNCTION public.consume_reveal_rate_limit(
  p_family_user_id uuid,
  p_triggered_captcha boolean DEFAULT false
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  needs_captcha boolean
)
AS $$
DECLARE
  v_captcha_threshold integer := 10;
  v_hard_cap integer := 25;
  v_consecutive integer := 0;
  v_count integer;
BEGIN
  -- Streak accounting only matters when this reveal is the first row of the
  -- day (the ON CONFLICT path below leaves consecutive_captcha_days alone,
  -- matching the previous behaviour of not re-bumping it within a day).
  IF p_triggered_captcha THEN
    SELECT CASE
             WHEN rl.captcha_triggered
               THEN COALESCE(rl.consecutive_captcha_days, 0) + 1
             ELSE 1
           END
      INTO v_consecutive
    FROM public.rate_limit_reveals rl
    WHERE rl.family_user_id = p_family_user_id
      AND rl.date = CURRENT_DATE - 1;

    -- SELECT INTO leaves the variable NULL when no row matched (no reveals
    -- yesterday), which means the streak starts at day 1.
    v_consecutive := COALESCE(v_consecutive, 1);
  END IF;

  INSERT INTO public.rate_limit_reveals (
    family_user_id,
    date,
    reveal_count,
    captcha_triggered,
    consecutive_captcha_days
  )
  VALUES (
    p_family_user_id,
    CURRENT_DATE,
    1,
    p_triggered_captcha,
    v_consecutive
  )
  ON CONFLICT (family_user_id, date) DO UPDATE
    SET reveal_count = rate_limit_reveals.reveal_count + 1,
        captcha_triggered =
          rate_limit_reveals.captcha_triggered OR p_triggered_captcha
    WHERE rate_limit_reveals.reveal_count < v_hard_cap
  RETURNING reveal_count INTO v_count;

  -- No row came back: the DO UPDATE guard refused because the family is
  -- already at the cap. v_count is NULL here, not 0, so branch on IS NULL
  -- rather than letting a falsy read through as "allowed".
  IF v_count IS NULL THEN
    SELECT rl.reveal_count INTO v_count
    FROM public.rate_limit_reveals rl
    WHERE rl.family_user_id = p_family_user_id
      AND rl.date = CURRENT_DATE;

    RETURN QUERY SELECT false, COALESCE(v_count, v_hard_cap), true;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_count, v_count >= v_captcha_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.consume_reveal_rate_limit(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_reveal_rate_limit(uuid, boolean) TO service_role;
