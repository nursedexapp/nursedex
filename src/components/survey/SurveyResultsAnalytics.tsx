"use client";

import { useEffect, useRef } from "react";
import { captureClientEvent } from "@/lib/analytics/capture";
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
    if (lastSent.current === fingerprint) return;
    // Only mark it sent when it really was: a refused capture (no consent, or
    // PostHog not running) must stay eligible.
    const sent = captureClientEvent(ANALYTICS_EVENTS.SURVEY_COMPLETED, {
      ...filters,
      result_count: resultCount,
    });
    if (sent) lastSent.current = fingerprint;
  }, [fingerprint, filters, resultCount]);

  return null;
}
