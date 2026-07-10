-- ============================================================
-- Self-write INSERT policies: pin the row's shape, not just its owner (#523)
-- ============================================================
-- PR #522 (after #389/#511) found that hires_insert_* and reviews_insert let a
-- caller insert a row in a state the app would never create: an already
-- confirmed hire, an already approved review. The policies checked WHO owned
-- the row and said nothing about its SHAPE.
--
-- Issue #523 asked for a systematic pass over every table with a self-write
-- INSERT policy. Two more had the same gap. Both are demonstrated by
-- src/lib/__tests__/rls-insert-shape.test.ts, which fails against the old
-- policies and passes against these.
--
-- Audit result for every other self-write INSERT policy, so the reasoning is
-- not lost:
--
--   reveals, hires, reviews, users, nurse_profiles
--       Already guarded (043, 046, 047, 048). reveals additionally pins
--       access_expires_at IS NULL and requires an active family subscription,
--       so the paywall cannot be bypassed by a direct PostgREST insert.
--   saved_nurses, family_profiles
--       Owner check is sufficient: every remaining column is a self-owned id
--       or preference, and none crosses a security boundary.
--   nurse_review_links
--       One row per nurse (nurse_user_id is the primary key) and the token is
--       the nurse's own. Setting it is equivalent to regenerating it.
--   blocked_emails, blog_posts
--       Admin-only (is_admin()); admins are trusted with the row's contents.
--   search_gap_log, waitlist
--       Anonymous inserts with no security boundary. An attacker can skew
--       analytics (result_count) or spoof waitlist.ip_hash. Accepted: neither
--       grants access nor hides anything from an operator, and pinning
--       waitlist.ip_hash would break a future signup path that sets it
--       server-side.

-- ─── contact_submissions: a submitter cannot pre-resolve their own message ──
-- contact_insert was WITH CHECK (true) and anon holds the INSERT grant (044),
-- so anyone could submit a message already flagged is_read = true, hiding it
-- from the admin unread queue, and could plant admin_notes for an admin to
-- read as if a colleague had written them. The app (src/lib/contact/actions.ts)
-- only ever sets name, email, subject and message, so both columns must arrive
-- at their defaults.

DROP POLICY IF EXISTS contact_insert ON public.contact_submissions;
CREATE POLICY contact_insert ON public.contact_submissions
  FOR INSERT WITH CHECK (
    is_read = false
    AND admin_notes IS NULL
  );

-- ─── admin_actions: an admin cannot forge the audit trail ───────────────────
-- admin_actions_insert only checked is_admin(), so any admin could write an
-- audit-log row attributing a suspension or removal to a DIFFERENT admin. The
-- table exists to answer "who did this", so an unattributable row defeats its
-- purpose. Every app insert site (admin/account-actions.ts,
-- admin/review-actions.ts, admin/verification-actions.ts) writes the calling
-- admin's own id through the user client, so pinning it to auth.uid() changes
-- no legitimate path.

DROP POLICY IF EXISTS admin_actions_insert ON public.admin_actions;
CREATE POLICY admin_actions_insert ON public.admin_actions
  FOR INSERT WITH CHECK (
    public.is_admin()
    AND admin_user_id = auth.uid()
  );
