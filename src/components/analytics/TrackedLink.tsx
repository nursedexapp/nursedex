"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { captureClientEvent } from "@/lib/analytics/capture";
import type { AnalyticsEvent } from "@/lib/analytics/capture";

interface TrackedLinkProps {
  href: string;
  /** Fired once, the first time the link is actually on screen. */
  seenEvent: AnalyticsEvent;
  /** Fired every time it is followed. */
  clickedEvent: AnalyticsEvent;
  /** Carried on both events, so a sighting and a click can be compared. */
  properties: Record<string, unknown>;
  className?: string;
  children: React.ReactNode;
}

/**
 * A link that records being SEEN as well as being clicked.
 *
 * Seen is the half that is usually missing and usually the half that matters:
 * someone who never reached the link and someone who reached it and ignored it
 * look identical in the data, and they point at completely different fixes.
 *
 * This began as the homepage call to action (see TrackedCta, which is now a
 * thin wrapper over it) and was lifted out when the Featured upsell needed the
 * same behaviour (#969). It is deliberately one implementation rather than two:
 * the ordering rule below is subtle enough that a second copy would drift.
 *
 * Scroll depth deliberately is NOT captured here. PostHog already records
 * $prev_pageview_max_scroll_percentage on every page leave, so a second
 * measurement would be a rival number for the same fact.
 */
export function TrackedLink({
  href,
  seenEvent,
  clickedEvent,
  properties,
  className,
  children,
}: TrackedLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const seenFired = useRef(false);
  const latestProperties = useRef(properties);
  latestProperties.current = properties;
  const latestSeenEvent = useRef(seenEvent);
  latestSeenEvent.current = seenEvent;

  useEffect(() => {
    const element = ref.current;
    // No typeof guard for IntersectionObserver: next/link uses the same API for
    // prefetching, so a browser without it has already lost the link long
    // before it reaches this line. A guard here would be dead code that reads
    // like a considered decision.
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seenFired.current) continue;
        // Only mark it seen, and only stop watching, if the event actually
        // went. Setting the flag first meant a capture that arrived before
        // PostHog had loaded was dropped AND the observer disconnected, so the
        // sighting could never be recorded at all.
        if (
          !captureClientEvent(
            latestSeenEvent.current,
            latestProperties.current,
          )
        ) {
          continue;
        }
        seenFired.current = true;
        observer.disconnect();
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onClick={() =>
        captureClientEvent(clickedEvent, latestProperties.current)
      }
    >
      {children}
    </Link>
  );
}
