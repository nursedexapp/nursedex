"use client";

import { useEffect, useRef } from "react";
import { captureClientEvent } from "@/lib/analytics/capture";
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
  const fingerprint = JSON.stringify(filters);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (lastSent.current === fingerprint) return;
    // Only mark it sent when it really was: a refused capture (no consent, or
    // PostHog not running) must stay eligible.
    const sent = captureClientEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
      ...filters,
      result_count: resultCount,
    });
    if (sent) lastSent.current = fingerprint;
  }, [fingerprint, filters, resultCount]);

  return null;
}
