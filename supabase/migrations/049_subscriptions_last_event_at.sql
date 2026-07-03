-- ============================================================
-- subscriptions.last_event_at (#414 follow-up)
-- ============================================================
-- The webhook has no way to tell an out-of-order Stripe event from a
-- current one: it just overwrites status/period/cancel_at_period_end with
-- whatever the event currently being processed says. An older
-- customer.subscription.updated delivered after a newer one (or after a
-- delete) can revert state, e.g. un-cancelling a subscription. Stores the
-- Stripe event `created` timestamp of the last event actually applied to a
-- row so the webhook can ignore anything older.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;
