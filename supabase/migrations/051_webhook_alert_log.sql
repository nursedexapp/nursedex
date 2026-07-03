-- ============================================================
-- webhook_alert_log (#396 follow-up)
-- ============================================================
-- Without this, a persistently-failing Stripe event (Stripe retries a
-- failed webhook repeatedly over hours to days) would post a fresh Slack
-- ops alert on every retry, flooding the channel for one underlying
-- problem. Deliberately not the existing email_log table: its
-- recipient_user_id is NOT NULL with a real FK to users, which doesn't
-- fit an ops-level alert with no user recipient. Sentry capture itself is
-- NOT deduped here (Sentry already groups identical errors into one
-- issue by fingerprint); only the Slack post is.

CREATE TABLE public.webhook_alert_log (
  event_id text PRIMARY KEY,
  alerted_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role ever touches this table (webhook route runs
-- server-side with the service-role client); no anon/authenticated
-- access needed.
ALTER TABLE public.webhook_alert_log ENABLE ROW LEVEL SECURITY;
