"use client";

import { useEffect, useRef } from "react";
import { useTrackingState } from "@/lib/consent/use-consent-state";
import { captureClientEvent, type AnalyticsEvent } from "./capture";

/**
 * Sends `event` once per `key` from a component that reports what a page
 * showed when it opened (a blog post, a set of search results).
 *
 * The attempt is repeated whenever tracking becomes allowed, so a visitor who
 * accepts the cookie banner on the page still sends that page's event, as the
 * $pageview already does. A key is marked sent only when the capture really
 * happened: one refused for want of consent stays eligible, and this is what
 * asks again. Properties are read when it sends, so a new object each render
 * neither re-sends nor goes stale. A null key means not yet: nothing is sent
 * until the caller supplies one.
 */
export function useCaptureOnce(
  event: AnalyticsEvent,
  properties: Record<string, unknown>,
  key: string | null,
): void {
  const tracking = useTrackingState();
  const lastSent = useRef<string | null>(null);
  const latest = useRef(properties);

  useEffect(() => {
    latest.current = properties;
  });

  useEffect(() => {
    if (key === null || tracking !== "allowed" || lastSent.current === key)
      return;
    if (captureClientEvent(event, latest.current)) lastSent.current = key;
  }, [event, key, tracking]);
}
