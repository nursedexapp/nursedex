-- ============================================================
-- Newsletter subscribers
-- ============================================================
--
-- Email capture for the blog newsletter, kept separate from the launch
-- waitlist (which is role-specific). Anyone may subscribe (public insert);
-- only admins can read the list. `source` records where they signed up
-- (blog index, post, etc.); `unsubscribed_at` is reserved for a future
-- unsubscribe flow.

CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can subscribe.
CREATE POLICY newsletter_insert_anon ON public.newsletter_subscribers
  FOR INSERT WITH CHECK (true);

-- Only admins can read the list.
CREATE POLICY newsletter_select_admin ON public.newsletter_subscribers
  FOR SELECT USING (public.is_admin());
