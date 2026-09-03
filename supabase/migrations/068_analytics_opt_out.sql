-- ============================================================
-- A real analytics opt-out, stored against the person (#715)
-- ============================================================
-- The privacy policy tells people they can opt out of analytics tracking.
-- Until now the only mechanisms were the browser's Do Not Track setting,
-- which we honour, and emailing support, which had no process behind it:
-- nothing recorded that an opt-out was asked for or that it was granted.
-- Safari has removed its Do Not Track toggle and other browsers are
-- following, so for a growing share of people the stated right had no way
-- to exercise it at all.
--
-- This is the record of the choice. It lives on the person rather than in
-- the browser so that it survives a new device, a cleared cache, and a
-- different browser, which is exactly what a browser-level setting cannot
-- do.
--
-- Shaped deliberately like users.marketing_opt_out, which is the same kind
-- of fact: NOT NULL with a false default, so every existing row means "has
-- not opted out" rather than "unknown", and no reader has to handle a null.
-- The column is named for what a true value MEANS, so a reader cannot
-- mistake its polarity.
--
-- No new RLS policy is needed. users_select_own and users_update_own already
-- let a person read and write their own row, which is exactly and only who
-- may change this.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS analytics_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.analytics_opt_out IS
  'True when this person has asked not to be tracked by analytics. Honoured on the client (posthog opt_out_capturing, which also stops session recording) and on the server (captureServerEvent refuses to send). See #715.';
