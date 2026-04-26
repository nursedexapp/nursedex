"use client";

import { useEffect, useRef } from "react";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { SearchFilters } from "@/lib/nurses/search-params";

interface SearchAnalyticsProps {
  filters: SearchFilters;
  resultCount: number;
}

/**
 * Fires a PostHog search_performed event once per unique filter-set render.
 * Rendering this in a server page means it captures on every server-rendered
 * load — including initial nav and filter changes that re-fetch the page.
 */
export function SearchAnalytics({
  filters,
  resultCount,
}: SearchAnalyticsProps) {
  const fingerprint = JSON.stringify(filters);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog.__loaded) return;
    if (lastSent.current === fingerprint) return;
    lastSent.current = fingerprint;
    posthog.capture(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
      ...filters,
      result_count: resultCount,
    });
  }, [fingerprint, filters, resultCount]);

  return null;
}
