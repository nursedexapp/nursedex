-- #708. handleNewRequest inserted a consulting_requests row per modal submission
-- with nothing to stop a repeat. Its only unique index is
-- (slack_channel, slack_thread_ts), and the thread is created fresh on each
-- submission, so a repeat produced a brand-new thread, a second row, a second
-- background AI-estimate call and a second ops ping.
--
-- The realistic duplicate here is not a double-click (Slack disables the modal's
-- submit button) but a RETRY: Slack re-delivers a webhook when the first delivery
-- times out, replaying the identical payload. So the idempotency key has to be
-- something Slack itself keeps stable across that retry.
--
-- view.id is exactly that: unique per opened modal, and the same on every
-- re-delivery of its submission. It is the closest thing to a client-minted id
-- available here, since this table's own id is database-generated and cannot be
-- minted up front the way blog posts and contact messages now are (#696).

ALTER TABLE public.consulting_requests
  ADD COLUMN IF NOT EXISTS slack_view_id text;

-- Partial: every row that predates this column has NULL here, and NULLs are
-- distinct in Postgres anyway, but stating it keeps the intent obvious. Rows
-- created any other way than a modal submission legitimately have no view.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_consulting_requests_slack_view
  ON public.consulting_requests (slack_view_id)
  WHERE slack_view_id IS NOT NULL;
