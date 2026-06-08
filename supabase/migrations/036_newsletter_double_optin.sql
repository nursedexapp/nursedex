-- ============================================================
-- Newsletter double opt-in
-- ============================================================
--
-- A subscriber is created unconfirmed with a confirmation_token; they
-- become a real subscriber only after clicking the emailed confirmation
-- link (confirmed_at set). Sending lists should use confirmed_at IS NOT
-- NULL AND unsubscribed_at IS NULL.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmation_token text UNIQUE;

CREATE INDEX idx_newsletter_subscribers_token
  ON public.newsletter_subscribers (confirmation_token)
  WHERE confirmation_token IS NOT NULL;
