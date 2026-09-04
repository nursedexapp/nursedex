"use client";

import { TrackedLink } from "./TrackedLink";
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
 * The behaviour itself lives in TrackedLink, which the Featured upsell shares
 * (#969). This stays as the homepage's own name for it, so a call site reads as
 * a homepage call to action rather than as a generic link with two event names
 * threaded through it.
 */
export function TrackedCta({
  href,
  audience,
  cta,
  placement,
  className,
  children,
}: TrackedCtaProps) {
  return (
    <TrackedLink
      href={href}
      seenEvent={ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN}
      clickedEvent={ANALYTICS_EVENTS.HOMEPAGE_CTA_CLICKED}
      properties={{ audience, cta, placement }}
      className={className}
    >
      {children}
    </TrackedLink>
  );
}
