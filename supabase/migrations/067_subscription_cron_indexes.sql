-- ============================================================
-- Indexes for the daily subscription crons (#439)
-- ============================================================
-- subscriptions carried indexes on user_id and stripe_subscription_id
-- only, which are the columns the app looks a subscription up BY. The
-- three daily crons ask a different question: which subscriptions are in
-- a given state right now. None of status, plan_type, current_period_end
-- or access_expires_at was indexed, so each of those crons read the whole
-- table.
--
-- HONESTLY, AT TODAY'S SIZE THIS CHANGES NOTHING MEASURABLE. Production
-- holds three subscriptions, and Postgres will keep choosing a sequential
-- scan over any index here until the table is far larger; that is the
-- planner being right, not the index being wrong. The issue asked for
-- EXPLAIN to show an index scan, and it will not, at three rows or three
-- hundred.
--
-- They are added anyway because each one is small, each matches a
-- predicate that already exists in the code, and the alternative is
-- discovering the missing index on the day a cron starts running out of
-- its 60 second budget, which is exactly when nobody wants to be writing
-- a migration.
--
-- Each index is PARTIAL, matching the predicate the cron actually uses,
-- so it stays small: only the rows a cron would look at are in it.

-- payment-failure: .eq("status", "past_due")
CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due
  ON public.subscriptions (status)
  WHERE status = 'past_due';

-- renewal-reminder: .eq("status","active").eq("cancel_at_period_end",false)
-- with a one day window on current_period_end. The window column leads the
-- index, so the range scan is what the index is ordered by.
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal_window
  ON public.subscriptions (current_period_end)
  WHERE status = 'active' AND cancel_at_period_end = false;

-- access-expiry: .eq("plan_type","family_access") with a one day window on
-- access_expires_at. Rows with no expiry are excluded: the cron can never
-- match them, and they are the majority of the table.
CREATE INDEX IF NOT EXISTS idx_subscriptions_access_expiry
  ON public.subscriptions (access_expires_at)
  WHERE plan_type = 'family_access' AND access_expires_at IS NOT NULL;
