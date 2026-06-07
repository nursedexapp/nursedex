-- ============================================================
-- Claude-suggested GitHub labels for a consulting request
-- ============================================================
-- At intake, Claude picks relevant repo labels (enhancement / bug /
-- documentation / security) alongside the type + estimate. When the
-- request is approved, the auto-created issue gets the always-on
-- `consulting` label plus these.

ALTER TABLE public.consulting_requests
  ADD COLUMN IF NOT EXISTS suggested_labels text[];
