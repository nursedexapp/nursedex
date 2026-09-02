import { posthog } from "@/lib/posthog";
import type { ANALYTICS_EVENTS } from "./events";

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Capture a client-side event, no-oping when PostHog has not loaded (missing
 * env keys, or an ad blocker that beat the proxy).
 *
 * This exists so the `posthog.__loaded` guard is written once. Before #864 it
 * was hand-copied at every call site, and a call site that forgets it throws
 * inside a click handler, which turns an analytics gap into a broken button.
 */
export function captureClientEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (!posthog.__loaded) return;
  posthog.capture(event, properties);
}
