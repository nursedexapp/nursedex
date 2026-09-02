"use client";

import { useEffect } from "react";
import { initPostHog, posthog } from "@/lib/posthog";
import { applyAnalyticsPreference } from "@/lib/analytics/preference";

/**
 * Links the PostHog person to our user id so client events (anonymous until
 * now) and server-side captures (webhook outcomes, keyed by user id) land on
 * the same person. identify() also merges the device's prior anonymous
 * history into the identified person, stitching pre-login events.
 *
 * Render from any layout or page that knows the logged-in user. Calling
 * initPostHog first covers the case where the root provider's init effect
 * hasn't run yet (it sits behind a Suspense boundary); both calls no-op when
 * already done.
 *
 * It also carries the person's stored analytics choice to this browser (#715).
 * PostHog persists an opt-out in the browser's own storage, so on the device
 * where the choice was made it is already in force; this is the path that
 * reaches a device that has never seen it, which is the entire reason the
 * choice is stored against the person rather than in a cookie.
 *
 * The preference is applied BEFORE identify, and identify is skipped entirely
 * for somebody opted out, because identify is itself a capture, and it is the
 * one that attaches their email address to a PostHog profile.
 *
 * Known gap, named rather than hidden: this component renders on the dashboard
 * and the pricing page, so on a BRAND NEW device a few public pageviews can be
 * recorded before the person reaches one of them. Those are anonymous
 * (person_profiles is "identified_only", so a signed-out visitor gets no
 * profile), and closing it would mean a database read in the root layout on
 * every public page, which is the forced-dynamic cost #430 exists to remove.
 */
export function PostHogIdentify({
  userId,
  email,
  analyticsOptOut,
}: {
  userId: string;
  email?: string;
  analyticsOptOut: boolean;
}) {
  useEffect(() => {
    initPostHog();
    if (!posthog.__loaded) return;

    // Before the early return below, not after: a person already identified on
    // this device is exactly the person whose choice may have changed
    // somewhere else.
    applyAnalyticsPreference(analyticsOptOut);
    if (analyticsOptOut) return;

    if (posthog.get_distinct_id() === userId) return;
    posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email, analyticsOptOut]);

  return null;
}
