"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface TrackedCtaProps {
  href: string;
  /** Which of the two audiences this button speaks to. */
  audience: "families" | "nurses";
  /** Stable short name for the button itself, not its wording. */
  cta: string;
  /** Where on the page it sits, so a hero click can be told from a footer one. */
  placement: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A homepage call to action that records being SEEN as well as being clicked.
 *
 * Seen is the half that was missing and the half that matters most: a visitor
 * who never scrolled to the button and one who saw it and ignored it look
 * identical in the data today, and they point at completely different fixes.
 *
 * Scroll depth deliberately is NOT captured here. PostHog already records
 * $prev_pageview_max_scroll_percentage on every page leave, so a second
 * measurement would be a rival number for the same fact.
 */
export function TrackedCta({
  href,
  audience,
  cta,
  placement,
  className,
  children,
}: TrackedCtaProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const seenFired = useRef(false);
  const properties = { audience, cta, placement };
  const latestProperties = useRef(properties);
  latestProperties.current = properties;

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
        seenFired.current = true;
        captureClientEvent(
          ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN,
          latestProperties.current,
        );
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
        captureClientEvent(
          ANALYTICS_EVENTS.HOMEPAGE_CTA_CLICKED,
          latestProperties.current,
        )
      }
    >
      {children}
    </Link>
  );
}
