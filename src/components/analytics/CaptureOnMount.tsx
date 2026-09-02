"use client";

import { useEffect, useRef } from "react";
import { captureClientEvent, type AnalyticsEvent } from "@/lib/analytics/capture";

interface CaptureOnMountProps {
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
  /**
   * Fire again when this changes. Defaults to the event name, so the event
   * fires once per mount. Pass a record id to re-fire when the page shows a
   * different record without remounting.
   */
  dedupeKey?: string;
}

/**
 * Fires one named event when a page mounts. Render it from a server component
 * to instrument a page view of something specific (a nurse profile, the start
 * of onboarding) without making the whole page a client component.
 *
 * The dedupe ref matters because React runs effects twice in development
 * Strict Mode, and a double count is indistinguishable from real traffic once
 * it is in PostHog.
 */
export function CaptureOnMount({
  event,
  properties,
  dedupeKey,
}: CaptureOnMountProps) {
  const key = dedupeKey ?? event;
  const lastFired = useRef<string | null>(null);
  // Held in a ref so a new object identity each render cannot re-fire the
  // event; only the dedupe key decides that.
  const latestProperties = useRef(properties);
  latestProperties.current = properties;

  useEffect(() => {
    if (lastFired.current === key) return;
    lastFired.current = key;
    captureClientEvent(event, latestProperties.current);
  }, [event, key]);

  return null;
}
