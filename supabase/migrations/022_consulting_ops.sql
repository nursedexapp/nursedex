-- ============================================================
-- Consulting ops: request intake, approvals, hour tracking
-- ============================================================
-- Internal tooling for the post-build consulting work that runs
-- through the #projects-and-maintenance Slack channel. Tiana submits a
-- request, Dan triages it as maintenance ($25/hr) or ad hoc ($75/hr),
-- ad hoc work is approved before it starts, and hours are logged on
-- completion. These tables are written only by the Slack endpoint and
-- the /done skill via the service role. RLS is enabled with no
-- policies, so anon/authenticated reach zero rows; the service role
-- bypasses RLS. Prefixed consulting_* in public so no extra schema is
-- exposed, while staying clearly separate from product tables.

-- A consulting request. Created at intake; type/rate/estimate are set
-- at triage; approval fields are set when ad hoc work is approved;
-- summary/pr_urls are set on completion.
CREATE TABLE IF NOT EXISTS public.consulting_requests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title           text NOT NULL,
  description     text,
  urgency         text,
  deadline        date,
  links           text,
  type            text CHECK (type IN ('maintenance', 'ad_hoc')),
  rate            numeric(10,2) CHECK (rate >= 0),
  estimate_hours  numeric(6,2) CHECK (estimate_hours >= 0),
  status          text NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted', 'triaged', 'approved', 'rejected', 'in_progress', 'done', 'invoiced')),
  slack_channel   text NOT NULL,
  slack_thread_ts text NOT NULL,
  requested_by    text,
  triaged_by      text,
  approved_at     timestamptz,
  approved_by     text,
  summary         text,
  pr_urls         text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_requests_status
  ON public.consulting_requests (status);

-- One Slack request maps to exactly one thread.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_consulting_requests_thread
  ON public.consulting_requests (slack_channel, slack_thread_ts);

-- One logged work session against a request. billed_min is what the
-- invoice uses; wall_clock/active/commit_span are the transparency
-- signals the /done skill computes (raw session time, idle-trimmed
-- active time, and the git commit span on the branch).
CREATE TABLE IF NOT EXISTS public.consulting_time_entries (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id      bigint NOT NULL REFERENCES public.consulting_requests (id) ON DELETE CASCADE,
  work_date       date NOT NULL DEFAULT current_date,
  wall_clock_min  integer CHECK (wall_clock_min >= 0),
  active_min      integer CHECK (active_min >= 0),
  commit_span_min integer CHECK (commit_span_min >= 0),
  billed_min      integer NOT NULL CHECK (billed_min >= 0),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_time_entries_request
  ON public.consulting_time_entries (request_id);

-- Keep updated_at current on the request row.
CREATE OR REPLACE FUNCTION public.consulting_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consulting_requests_touch ON public.consulting_requests;
CREATE TRIGGER trg_consulting_requests_touch
  BEFORE UPDATE ON public.consulting_requests
  FOR EACH ROW EXECUTE FUNCTION public.consulting_touch_updated_at();

-- Lock down: RLS on, no policies. Service role (used by the Slack
-- endpoint and /done skill) bypasses RLS; everyone else gets nothing.
ALTER TABLE public.consulting_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulting_time_entries ENABLE ROW LEVEL SECURITY;
