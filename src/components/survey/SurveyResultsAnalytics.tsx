"use client";

import { useEffect, useRef } from "react";
import { posthog } from "@/lib/posthog";
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
  const fingerprint = JSON.stringify(filters);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog.__loaded) return;
    if (lastSent.current === fingerprint) return;
    lastSent.current = fingerprint;
    posthog.capture(ANALYTICS_EVENTS.SURVEY_COMPLETED, {
      ...filters,
      result_count: resultCount,
    });
  }, [fingerprint, filters, resultCount]);

  return null;
}
