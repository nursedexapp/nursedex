-- reveal_nurse (issue #691, unblocking #669)
--
-- THE BUG
--
-- revealNurse spent a slot from the family's capped daily allowance BEFORE it
-- wrote the reveal row:
--
--   1. is this nurse already revealed?  (no)
--   2. consume_reveal_rate_limit()      <- the slot is gone here
--   3. INSERT INTO reveals              <- the reveal appears here
--
-- Spending first is deliberate: the increment is the cap gate (migration 054),
-- and doing it after the insert would let a burst write reveals faster than the
-- cap could refuse them. But it leaves a window between 2 and 3. Two attempts
-- that overlap in that window BOTH pass step 1 and BOTH pay at step 2, and the
-- family ends up with one reveal and two slots gone from a capped daily
-- allowance. Charging a family twice for one nurse is the exact harm #653 was
-- opened to prevent.
--
-- It needs no retry button to happen: two concurrent requests are enough. It
-- also blocks #669, because handing the user a retry makes the window trivially
-- easy to hit.
--
-- THE FIX
--
-- Fold the check, the spend and the write into ONE function, so they are one
-- transaction. Any caller that arrives to find the reveal already there spends
-- nothing, and a caller that loses the race after paying gets its slot back.
--
-- The cap still works, because the spend still comes before the write: this
-- reuses consume_reveal_rate_limit rather than reimplementing it, so migration
-- 054 remains the single definition of the cap and its tests still bind it.

CREATE OR REPLACE FUNCTION public.reveal_nurse(
  p_family_user_id uuid,
  p_nurse_user_id uuid,
  p_triggered_captcha boolean DEFAULT false
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  needs_captcha boolean,
  already_revealed boolean
)
AS $$
DECLARE
  v_count integer;
  v_allowed boolean;
  v_needs_captcha boolean;
BEGIN
  -- Already revealed. The family owns this contact, so hand it straight back and
  -- spend nothing. This is what makes a retry safe, and it deliberately runs
  -- BEFORE the cap check: a family at their daily limit has not lost access to
  -- the nurses they already revealed.
  IF EXISTS (
    SELECT 1
    FROM public.reveals r
    WHERE r.family_user_id = p_family_user_id
      AND r.nurse_user_id = p_nurse_user_id
  ) THEN
    SELECT rl.reveal_count INTO v_count
    FROM public.rate_limit_reveals rl
    WHERE rl.family_user_id = p_family_user_id
      AND rl.date = CURRENT_DATE;

    RETURN QUERY SELECT true, COALESCE(v_count, 0), false, true;
    RETURN;
  END IF;

  -- Spend a slot. The increment IS the gate (migration 054): it enforces the cap
  -- in the same statement that increments, so a burst can neither lose an
  -- increment nor slip past the cap.
  SELECT c.allowed, c.current_count, c.needs_captcha
    INTO v_allowed, v_count, v_needs_captcha
  FROM public.consume_reveal_rate_limit(p_family_user_id, p_triggered_captcha) c;

  IF NOT v_allowed THEN
    RETURN QUERY SELECT false, v_count, true, false;
    RETURN;
  END IF;

  INSERT INTO public.reveals (family_user_id, nurse_user_id)
  VALUES (p_family_user_id, p_nurse_user_id)
  ON CONFLICT (family_user_id, nurse_user_id) DO NOTHING;

  -- No row inserted: a concurrent caller wrote this exact reveal while we were
  -- spending. We paid for a reveal that already exists, so give the slot back.
  -- This is the whole point of the migration. Without it, the loser of the race
  -- silently burns one of the family's capped daily reveals for nothing.
  IF NOT FOUND THEN
    UPDATE public.rate_limit_reveals
       SET reveal_count = reveal_count - 1
     WHERE family_user_id = p_family_user_id
       AND date = CURRENT_DATE
    RETURNING reveal_count INTO v_count;

    RETURN QUERY SELECT true, COALESCE(v_count, 0), false, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_count, v_needs_captcha, false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same posture as consume_reveal_rate_limit: the daily counter is
-- system-managed, so only the service role may drive this.
REVOKE EXECUTE ON FUNCTION public.reveal_nurse(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reveal_nurse(uuid, uuid, boolean) TO service_role;
