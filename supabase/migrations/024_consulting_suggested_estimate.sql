-- ============================================================
-- Claude-suggested triage estimate
-- ============================================================
-- At intake, the server asks Claude for a rough billing type + hour
-- estimate from the request description, stored here. The triage modal
-- pre-fills from these so Dan starts from a suggestion (which he can
-- adjust) instead of a blank field. Advisory only; the triaged values
-- on consulting_requests remain the source of truth.

ALTER TABLE public.consulting_requests
  ADD COLUMN IF NOT EXISTS suggested_estimate_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS suggested_type text
    CHECK (suggested_type IN ('maintenance', 'ad_hoc')),
  ADD COLUMN IF NOT EXISTS suggested_rationale text;
