-- ============================================================
-- apply_subscription_event (issue #528)
-- ============================================================
-- PR #526 gave the Stripe webhook an ordering guard: read the stored
-- last_event_at, compare it to the incoming event's `created` in JavaScript,
-- then conditionally upsert. That is a check-then-act pair. Two events for
-- the same subscription delivered at truly the same instant (not merely out
-- of order) can both read the same last_event_at, both decide they are newer,
-- and both write, so an older event can still clobber a newer one.
--
-- This is the same gap #417 closed for duplicate subscriptions by moving the
-- guarantee into the database (a unique constraint) rather than trusting
-- application-level check-then-act. Here the write itself carries the
-- ordering predicate: the INSERT ... ON CONFLICT is a single statement, so
-- concurrent events serialize on the stripe_subscription_id unique index from
-- 001_schema.sql, and the DO UPDATE ... WHERE refuses to overwrite a row
-- whose last_event_at is already newer.
--
-- Tie handling: `<=`, not `<`. Stripe's `created` is unix seconds and is not
-- unique across distinct events for the same object. Treating an equal
-- timestamp as stale would silently drop a legitimate second event stamped in
-- the same second. This preserves the JavaScript guard's exact semantics,
-- which only skipped strictly-older events.
--
-- The partial unique index uniq_subscriptions_active_per_plan (050) is NOT
-- this statement's ON CONFLICT target, so a duplicate active subscription
-- still raises 23505 and reaches the caller, which cancels the newly-created
-- Stripe subscription (#417). That behaviour is unchanged.

CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan_type subscription_plan,
  p_status subscription_status,
  p_billing_interval text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_last_event_at timestamptz
)
RETURNS boolean
AS $$
DECLARE
  v_applied boolean;
BEGIN
  INSERT INTO public.subscriptions (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    plan_type,
    status,
    billing_interval,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    last_event_at
  )
  VALUES (
    p_user_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_plan_type,
    p_status,
    p_billing_interval,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_last_event_at
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        plan_type = EXCLUDED.plan_type,
        status = EXCLUDED.status,
        billing_interval = EXCLUDED.billing_interval,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        last_event_at = EXCLUDED.last_event_at
    WHERE subscriptions.last_event_at IS NULL
       OR subscriptions.last_event_at <= EXCLUDED.last_event_at
  RETURNING true INTO v_applied;

  -- No row came back: the DO UPDATE guard refused because the stored event is
  -- strictly newer. v_applied is NULL here, not false, so coalesce rather
  -- than returning NULL to the caller.
  RETURN COALESCE(v_applied, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.apply_subscription_event(uuid, text, text, subscription_plan, subscription_status, text, timestamptz, timestamptz, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_subscription_event(uuid, text, text, subscription_plan, subscription_status, text, timestamptz, timestamptz, boolean, timestamptz) TO service_role;
