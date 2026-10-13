"use client";

import type { AnalyticsEvent } from "@/lib/analytics/capture";
import { useCaptureOnce } from "@/lib/analytics/use-capture-once";

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
 * A component form of useCaptureOnce, which is where the once per key rule
 * lives (React runs effects twice in development Strict Mode, and a double
 * count is indistinguishable from real traffic once it is in PostHog) and
 * where a visitor who accepts the cookie banner on the page is still counted.
 */
export function CaptureOnMount({
  event,
  properties,
  dedupeKey,
}: CaptureOnMountProps) {
  useCaptureOnce(event, properties ?? {}, dedupeKey ?? event);
  return null;
}
