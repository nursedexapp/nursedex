"use client";

import posthog from "posthog-js";
import { browserSendsPrivacySignal, setAccountAnalyticsOff } from "@/lib/consent/store";

/**
 * Apply a person's stored analytics choice to this browser (#715), and record
 * the account setting on this device so the consent gate and Sentry replay see
 * it too.
 *
 * `opt_out_capturing` stops events AND session recording, which is what the
 * privacy policy promises, and PostHog persists the decision in the browser's
 * own storage, so it survives a reload without us doing anything.
 *
 * It has to work in BOTH directions. Because PostHog persists the opt-out
 * itself, a person who changed their mind would otherwise stay untracked on
 * that device forever while their setting said the opposite: a control that
 * cannot be undone is a broken control, and the screen would be lying.
 *
 * The one thing it will not do is opt somebody IN over Do Not Track. A false
 * account flag is not a request to be tracked, it is the absence of a request
 * not to be, and treating it as consent would quietly undo the browser-level
 * choice we went to some trouble to start honouring.
 *
 * It also opts in only somebody who is currently opted OUT, rather than on
 * every page load, because `opt_in_capturing` writes a record that an explicit
 * choice was made, and for most people no such choice has been.
 */
export function applyAnalyticsPreference(optedOut: boolean): void {
  // Recorded on this device first, so the banner's gate and Sentry replay
  // both see it, including on pages that never render PostHogIdentify.
  setAccountAnalyticsOff(optedOut);

  if (!posthog.__loaded) return;

  if (optedOut) {
    posthog.opt_out_capturing();
    return;
  }

  if (browserSendsPrivacySignal()) return;
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
}
