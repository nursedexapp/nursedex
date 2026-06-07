-- ============================================================
-- Link consulting requests to their GitHub issue
-- ============================================================
-- When a request becomes workable (ad hoc on approval, maintenance on
-- triage), the Slack endpoint opens a GitHub issue in nursedexapp/nursedex
-- and stores its number + URL here. The /done flow closes that issue when
-- the request is completed.

ALTER TABLE public.consulting_requests
  ADD COLUMN IF NOT EXISTS github_issue_number integer,
  ADD COLUMN IF NOT EXISTS github_issue_url text;
