import { initPostHog, posthog } from "@/lib/posthog";
import type { ANALYTICS_EVENTS } from "./events";

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Capture a client-side event.
 *
 * Calls initPostHog first. PostHogProvider initializes PostHog inside a
 * Suspense boundary, so another component's effect can run BEFORE it, and a
 * capture at that moment used to see `__loaded` as false and return silently.
 * That did not delay the event, it destroyed it: measured on the live homepage,
 * the visit's $pageview arrived and homepage_cta_seen never did. PostHogIdentify
 * already guarded against this; doing it here means every caller is covered
 * rather than each one having to remember.
 *
 * Returns whether the event was actually captured, so a caller that only gets
 * one chance (an intersection that fires once) can tell a real send from a
 * dropped one instead of marking it done.
 */
export function captureClientEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): boolean {
  if (!posthog.__loaded) initPostHog();
  // Still not loaded means PostHog genuinely cannot run here: no keys, or
  // blocked. Nothing to retry against, but the caller is told.
  if (!posthog.__loaded) return false;

  posthog.capture(event, properties);
  return true;
}
