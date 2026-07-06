-- ============================================================
-- sentry_issue_alert_log (Sentry-to-Slack issue alerting)
-- ============================================================
-- The sentry-alerts cron polls Sentry's Issues API every 15 minutes for
-- issues currently needing review and posts a Slack alert for any not
-- already recorded here. Modeled directly on webhook_alert_log (051):
-- dedup is keyed by the thing itself (here, Sentry's issue id) so a
-- persistently-open issue doesn't re-alert every poll. Unlike
-- webhook_alert_log, rows here are also DELETED once an issue no longer
-- needs review, so if it later regresses it alerts again instead of
-- staying silently suppressed forever.

CREATE TABLE public.sentry_issue_alert_log (
  issue_id text PRIMARY KEY,
  alerted_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role ever touches this table (cron route runs
-- server-side with the service-role client); no anon/authenticated
-- access needed.
ALTER TABLE public.sentry_issue_alert_log ENABLE ROW LEVEL SECURITY;
