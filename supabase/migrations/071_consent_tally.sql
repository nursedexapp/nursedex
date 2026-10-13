-- supabase/migrations/071_consent_tally.sql
-- ============================================================
-- consent_tally
-- ============================================================
-- Once the cookie banner gates analytics, PostHog sees only visitors who
-- accepted, so every PostHog figure drops on launch day and reads like an
-- audience collapse. This counts, per New York day, browsers shown the
-- banner and each browser's first answer, so those figures can be read
-- against the share who accepted.
--
-- Three numbers per day: no visitor id, no IP, no cookie. Kinds match
-- CONSENT_EVENT_KINDS in src/lib/consent/kinds.ts.

CREATE TABLE public.consent_tally (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shown', 'accepted', 'declined')),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, kind)
);

-- 042 grants ALL on new public tables to anon and authenticated by default.
-- Only the service role touches this one, so take them back explicitly
-- rather than relying on RLS alone (L714).
ALTER TABLE public.consent_tally ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consent_tally FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.consent_tally TO service_role;

-- One atomic statement, so concurrent answers all count. A retried call
-- counts twice, which only nudges a ratio.
CREATE OR REPLACE FUNCTION public.increment_consent_tally(p_kind text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.consent_tally (day, kind, count)
  VALUES ((now() AT TIME ZONE 'America/New_York')::date, p_kind, 1)
  ON CONFLICT (day, kind)
  DO UPDATE SET count = public.consent_tally.count + 1;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_consent_tally(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_consent_tally(text) TO service_role;
