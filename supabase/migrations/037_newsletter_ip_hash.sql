-- ============================================================
-- Newsletter per-IP rate limiting
-- ============================================================
--
-- Hashed client IP recorded on subscribe so the action can rate-limit
-- mass subscriptions from one network (each new address sends a
-- confirmation email). Mirrors waitlist.ip_hash.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN ip_hash text;

CREATE INDEX idx_newsletter_subscribers_ip
  ON public.newsletter_subscribers (ip_hash, created_at);
