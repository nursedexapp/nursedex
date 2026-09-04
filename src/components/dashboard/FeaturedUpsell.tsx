"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface FeaturedUpsellProps {
  // Whether the nurse has been verified yet. Unverified nurses see no
  // upsell at all; the dashboard stays a calm space until their profile
  // is actually live.
  isVerified: boolean;
}

/**
 * Discreet upgrade prompt that lives at the bottom of the dashboard.
 * Replaces the previous gradient-card + bullet-list upsell, which felt
 * like a marketing card on a daily-use surface. The full Featured value
 * proposition lives on /pricing; the dashboard just leaves a quiet door
 * open for nurses who want to explore.
 *
 * It records being SEEN as well as clicked (#969). The only sighting event
 * before this fired from a toast on the profile edit page shown when a family
 * saved the nurse's profile, so it counted family activity rather than the
 * offer, and had fired twice in the product's life. `surface` is what tells the
 * two apart, which is why the toast keeps its own name and is not renamed.
 *
 * The properties deliberately stop at `surface`. Tier and verification would
 * be constants here, since the dashboard only renders this for a verified nurse
 * on the free tier, and a property that can only hold one value reports
 * nothing. The denominator this sighting count is read against (how many
 * verified free tier nurses exist) comes from the database, not from the event.
 */
export function FeaturedUpsell({ isVerified }: FeaturedUpsellProps) {
  if (!isVerified) return null;

  return (
    <div className="border-sage/20 border-t pt-5 text-center">
      <p className="text-soft-black-light text-sm">
        Want top placement and analytics?{" "}
        <TrackedLink
          href="/pricing"
          seenEvent={ANALYTICS_EVENTS.FEATURED_UPSELL_SHOWN}
          clickedEvent={ANALYTICS_EVENTS.FEATURED_UPSELL_CLICKED}
          properties={{ surface: "dashboard" }}
          className="text-teal hover:text-teal-dark font-medium underline underline-offset-4 hover:no-underline"
        >
          See Featured Pricing →
        </TrackedLink>
      </p>
    </div>
  );
}
