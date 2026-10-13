"use client";

import { useCaptureOnce } from "@/lib/analytics/use-capture-once";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { SearchFilters } from "@/lib/nurses/search-params";

interface SearchAnalyticsProps {
  filters: SearchFilters;
  resultCount: number;
}

/**
 * Fires a PostHog search_performed event once per unique filter-set render.
 * Rendering this in a server page means it captures on every server-rendered
 * load, including initial nav and filter changes that re-fetch the page.
 */
export function SearchAnalytics({
  filters,
  resultCount,
}: SearchAnalyticsProps) {
  useCaptureOnce(
    ANALYTICS_EVENTS.SEARCH_PERFORMED,
    { ...filters, result_count: resultCount },
    JSON.stringify(filters),
  );

  return null;
}
