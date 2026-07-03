-- ============================================================
-- Prevent duplicate active subscriptions (#417)
-- ============================================================
-- createCheckoutSession only blocks a second checkout if getActiveSubscription
-- already finds a row; for a first-time subscriber there is no row yet, so
-- two rapid clicks (or two tabs) can each create a Checkout Session, and if
-- both complete, the webhook upserts two distinct stripe_subscription_id
-- rows, both active/past_due, double-billing the same user for the same
-- plan. Application-level check-then-act can't close this race; only a DB
-- constraint can. The webhook (see upsertSubscription) now cancels the
-- newly-created Stripe subscription and skips the write when this
-- constraint is hit, rather than corrupting state or retrying forever.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscriptions_active_per_plan
  ON public.subscriptions (user_id, plan_type)
  WHERE status IN ('active', 'past_due');
