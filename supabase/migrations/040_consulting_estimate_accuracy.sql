-- ============================================================
-- Consulting estimate accuracy: suggested vs triaged vs actual
-- ============================================================
-- Each consulting request now carries three hour numbers: Claude's
-- suggested_estimate_hours (migration 024), Dan's triaged estimate_hours,
-- and the actual billed time summed from consulting_time_entries. Nothing
-- compared them, so there was no signal on whether Claude's intake
-- estimates are worth trusting or how to tune src/lib/ai/estimate.ts.
--
-- These views join the three numbers per completed request and report the
-- deltas, plus a rolled-up summary. Both are SECURITY INVOKER and revoked
-- from anon/authenticated so they honor the base tables' RLS (no policies =
-- zero rows for everyone but the service role), matching the lockdown the
-- consulting_* tables already have.

-- Per-request detail. Positive delta = the later number came in higher than
-- the earlier one (e.g. actual exceeded the suggestion).
CREATE OR REPLACE VIEW public.consulting_estimate_accuracy
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.title,
  r.status,
  r.type,
  r.suggested_type,
  r.suggested_estimate_hours,
  r.estimate_hours                                            AS triaged_estimate_hours,
  round(COALESCE(t.actual_min, 0) / 60.0, 2)                  AS actual_hours,
  round(r.estimate_hours - r.suggested_estimate_hours, 2)     AS suggested_vs_triaged_hours,
  round(COALESCE(t.actual_min, 0) / 60.0 - r.suggested_estimate_hours, 2)
                                                              AS suggested_vs_actual_hours,
  round(COALESCE(t.actual_min, 0) / 60.0 - r.estimate_hours, 2)
                                                              AS triaged_vs_actual_hours,
  r.created_at,
  r.updated_at
FROM public.consulting_requests r
LEFT JOIN (
  SELECT request_id, SUM(billed_min) AS actual_min
  FROM public.consulting_time_entries
  GROUP BY request_id
) t ON t.request_id = r.id
WHERE r.status IN ('done', 'invoiced');

-- Rolled-up signal across all completed requests. avg_*_bias is the mean
-- signed error (positive = the estimate ran low vs actual); avg_abs_* is the
-- mean magnitude regardless of direction.
CREATE OR REPLACE VIEW public.consulting_estimate_accuracy_summary
WITH (security_invoker = true) AS
SELECT
  count(*)                                                    AS completed_requests,
  count(*) FILTER (WHERE suggested_estimate_hours IS NOT NULL)
                                                              AS with_suggestion,
  round(avg(suggested_estimate_hours), 2)                     AS avg_suggested_hours,
  round(avg(triaged_estimate_hours), 2)                       AS avg_triaged_hours,
  round(avg(actual_hours), 2)                                 AS avg_actual_hours,
  round(avg(suggested_vs_actual_hours), 2)                    AS avg_suggested_bias_hours,
  round(avg(abs(suggested_vs_actual_hours)), 2)               AS avg_abs_suggested_error_hours,
  round(avg(triaged_vs_actual_hours), 2)                      AS avg_triaged_bias_hours,
  round(avg(abs(triaged_vs_actual_hours)), 2)                 AS avg_abs_triaged_error_hours
FROM public.consulting_estimate_accuracy;

REVOKE ALL ON public.consulting_estimate_accuracy         FROM anon, authenticated;
REVOKE ALL ON public.consulting_estimate_accuracy_summary FROM anon, authenticated;
GRANT  SELECT ON public.consulting_estimate_accuracy         TO service_role;
GRANT  SELECT ON public.consulting_estimate_accuracy_summary TO service_role;
