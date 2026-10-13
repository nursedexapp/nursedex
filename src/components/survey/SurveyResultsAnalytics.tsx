"use client";

import { useCaptureOnce } from "@/lib/analytics/use-capture-once";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { SearchFilters } from "@/lib/nurses/search-params";

interface SurveyResultsAnalyticsProps {
  filters: SearchFilters;
  resultCount: number;
}

/**
 * Fires survey_completed once per unique results render.
 */
export function SurveyResultsAnalytics({
  filters,
  resultCount,
}: SurveyResultsAnalyticsProps) {
  useCaptureOnce(
    ANALYTICS_EVENTS.SURVEY_COMPLETED,
    { ...filters, result_count: resultCount },
    JSON.stringify(filters),
  );

  return null;
}
