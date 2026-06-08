-- ============================================================
-- Newsletter unsubscribe token
-- ============================================================
--
-- A stable per-subscriber token so every newsletter send can include a
-- one-click unsubscribe link (required for marketing email). The volatile
-- default backfills existing rows with unique tokens; new rows get one on
-- insert (the subscribe upsert does not set it, so it is never reset).

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN unsubscribe_token text NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX idx_newsletter_subscribers_unsub_token
  ON public.newsletter_subscribers (unsubscribe_token);
