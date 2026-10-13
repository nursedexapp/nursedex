"use client";

import { useEffect } from "react";
import { initPostHog, posthog } from "@/lib/posthog";
import { applyAnalyticsPreference } from "@/lib/analytics/preference";
import { analyticsAllowed } from "@/lib/consent/store";
import { useConsentState } from "@/lib/consent/use-consent-state";

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
 * It also waits for the cookie banner: initPostHog refuses until this browser
 * has accepted and the account allows it, and the effect re-runs when either
 * changes. The preference is applied before initPostHog as well as after it,
 * because the gate reads the account setting from this device: recorded only
 * once PostHog runs, an opted out person who accepts the banner would start
 * PostHog and send a pageview before the opt-out arrived.
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
  const consent = useConsentState();

  useEffect(() => {
    // First, before anything can start PostHog: records the account setting on
    // this device, which initPostHog's gate reads, and stops replay for
    // somebody opted out. Also before the early returns below: a person
    // already identified on this device is exactly the person whose choice
    // may have changed somewhere else.
    applyAnalyticsPreference(analyticsOptOut);
    if (!posthog.__loaded) {
      initPostHog();
      if (!posthog.__loaded) return;
      // Started just now, so PostHog's own stored opt-out, from a time this
      // person was opted out, is only reachable now.
      applyAnalyticsPreference(analyticsOptOut);
    }
    if (analyticsOptOut || !analyticsAllowed()) return;

    if (posthog.get_distinct_id() === userId) return;
    posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email, analyticsOptOut, consent]);

  return null;
}
