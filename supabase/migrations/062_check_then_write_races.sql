-- #663. Sweep of the check-then-write race that produced #651, #652 and #653:
-- SELECT to see whether something exists or is in a given state, decide in
-- JavaScript, then write. Two concurrent callers both pass the check, both write,
-- and both fire the side effect.
--
-- Two of the offenders cannot be fixed in application code alone, because the
-- thing that has to be atomic spans more than one statement. They are fixed here.

-- ── 1. email_log: make the insert the gate ────────────────────────────────────
--
-- shouldSendOnce() read email_log for an existing (recipient_user_id, email_type,
-- dedup_key) row and inserted one if it found none. Its own docstring waved the
-- race off: "we don't have a unique constraint there ... crons run once a day so
-- the race window is negligible in practice."
--
-- That reasoning was wrong twice over. The helper is not cron-only: it also backs
-- the Stripe webhook's subscription emails (which Stripe retries, concurrently)
-- and the nurse-triggered hire resend (which a person can double-click). And a
-- cron that is retried or overlaps itself races with itself regardless.
--
-- email_log exists to stop duplicate emails, so the triple it dedupes on is a key
-- and should always have been one. With the index in place the INSERT itself is
-- the gate: the loser gets 23505 and sends nothing.

-- Any duplicates already written by the race have to go before the index can be
-- built. Keep the earliest row of each triple: it is the one whose email actually
-- went out first.
DELETE FROM public.email_log e
USING public.email_log keep
WHERE e.recipient_user_id = keep.recipient_user_id
  AND e.email_type = keep.email_type
  AND e.dedup_key = keep.dedup_key
  AND (e.sent_at, e.id) > (keep.sent_at, keep.id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_log_dedup
  ON public.email_log (recipient_user_id, email_type, dedup_key);

-- The old non-unique index on the same leading columns is now redundant: the
-- unique index above serves every read that one served.
DROP INDEX IF EXISTS public.idx_email_log_dedup_key;

-- ── 2. ensureIssue: create the GitHub issue exactly once ──────────────────────
--
-- ensureIssue() checked `if (req.github_issue_url) return` in JavaScript, then
-- called GitHub, and only wrote the resulting URL back afterwards. The window
-- between the check and the write is a network round trip to GitHub, so a
-- double-clicked Approve created TWO issues for one request.
--
-- It cannot claim the row with the URL itself, because it does not have the URL
-- until GitHub answers. So it claims this column instead: whoever sets it from
-- NULL owns the right to create the issue, and the loser stops. A creation that
-- fails releases the claim back to NULL so the next attempt can retry.
ALTER TABLE public.consulting_requests
  ADD COLUMN IF NOT EXISTS github_issue_claimed_at timestamptz;

-- ── 3. consulting /done: bill exactly once ────────────────────────────────────
--
-- The /done handler read the request's status, returned early if it was already
-- done or invoiced, then inserted a billable time entry and flipped the status to
-- done by id alone. Two overlapping /done calls both passed the check and both
-- logged billable time, so the same work was invoiced twice.
--
-- Claiming the row in the UPDATE's own WHERE clause fixes the double-billing, but
-- on its own it introduces a worse failure: the status would flip to done before
-- the time entry was written, so a failed insert would leave a completed request
-- with no billing on it. The claim and the billing have to land together or not at
-- all, which means one transaction. Same shape as reveal_nurse (059), for the same
-- reason: the money write cannot be a separate round trip from the gate.
--
-- service_role only. The route calls this with createServiceRoleClient behind the
-- ADMIN_SECRET header, and no end user should ever be able to bill a request.
CREATE OR REPLACE FUNCTION public.complete_consulting_request(
  p_request_id bigint,
  p_billed_min integer,
  p_summary text,
  p_pr_urls text[] DEFAULT '{}',
  p_wall_clock_min integer DEFAULT NULL,
  p_active_min integer DEFAULT NULL,
  p_commit_span_min integer DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed bigint;
BEGIN
  -- The gate. A request that is already done or invoiced matches nothing, so the
  -- loser of a race falls straight through to 'already_completed' having written
  -- nothing. NOT IN over the two terminal states (rather than IN over the open
  -- ones) preserves the handler's original behaviour exactly.
  UPDATE public.consulting_requests
     SET status = 'done',
         summary = p_summary,
         pr_urls = p_pr_urls
   WHERE id = p_request_id
     AND status NOT IN ('done', 'invoiced')
  RETURNING id INTO v_claimed;

  -- SELECT/UPDATE ... INTO leaves v_claimed NULL when no row matched, never 0
  -- (#66). Test for NULL, not falsiness.
  IF v_claimed IS NULL THEN
    RETURN 'already_completed';
  END IF;

  -- Only the winner bills. Same transaction as the claim above, so a failure here
  -- rolls the status back with it.
  INSERT INTO public.consulting_time_entries (
    request_id, wall_clock_min, active_min, commit_span_min, billed_min, note
  ) VALUES (
    p_request_id, p_wall_clock_min, p_active_min, p_commit_span_min,
    p_billed_min, p_note
  );

  RETURN 'completed';
END;
$$;

-- Explicit, narrow grants. REVOKE ... FROM authenticated in migration 052 silently
-- deleted six per-function grants and broke the reveal money path in production
-- (fixed by 060), so state who may run this rather than relying on a default.
REVOKE ALL ON FUNCTION public.complete_consulting_request(
  bigint, integer, text, text[], integer, integer, integer, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_consulting_request(
  bigint, integer, text, text[], integer, integer, integer, text
) TO service_role;
