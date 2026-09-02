-- ============================================================
-- job_heartbeats (#757)
-- ============================================================
-- Every cron alerts when it FAILS, through withCronAlerting. Nothing
-- noticed when one stopped firing at all, and from outside those two are
-- the same thing: silence. A job that errors is loud; a job that was
-- never invoked, or was silently dropped by the platform, or whose route
-- stopped being deployed, produces no alert and no log.
--
-- One row per job, written on every successful run, so the question
-- anybody actually asks (when did this last run) is answered directly
-- rather than aggregated out of a log, and so the table cannot grow
-- without bound.
--
-- The watcher that reads this deliberately does NOT live in Vercel: a
-- check that runs on the same scheduler as the jobs it watches dies with
-- them. It is the Job Watchdog workflow in GitHub Actions.

CREATE TABLE public.job_heartbeats (
  -- The job's name as withCronAlerting knows it, which is also the path
  -- segment in vercel.json, so the watchdog can match the two without a
  -- mapping table maintained by hand.
  job_name text PRIMARY KEY,

  -- When this job was first recorded. A job that has NEVER succeeded is
  -- judged from here, so adding a cron does not raise an alert before its
  -- first scheduled run. Written once by this default and never updated:
  -- the upsert deliberately omits the column.
  first_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Null until the job first gets through. Null and "long ago" are
  -- different states and the watchdog words them differently.
  last_success_at timestamptz,

  -- How long the last successful run took. A cron that is creeping toward
  -- its maxDuration sends only a prefix of its batch when it finally runs
  -- out, and returns nothing to say so (#440); this is what makes that
  -- visible before it happens.
  last_duration_ms integer,

  -- Whatever the route returned (sent, skipped, counts), capped by the
  -- writer. Kept so a short batch can be seen after the fact.
  last_result jsonb,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role ever touches this table: the crons write it
-- through the service-role client, and the one reader is an internal
-- route that authenticates its caller itself. No anon or authenticated
-- access is needed, and enabling RLS with no policy is what denies it.
ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;
