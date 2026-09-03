"use client";

import posthog from "posthog-js";

/**
 * Does this browser ask not to be tracked? (#498)
 *
 * PostHog checks this itself at init through `respect_dnt`. It is read again
 * here for a narrower reason: to make sure an ACCOUNT setting never opts
 * somebody back IN over a BROWSER setting. Those are two different promises,
 * and the browser's is the broader one.
 *
 * The three spellings are the ones browsers have actually shipped. "1" and
 * "yes" mean the person asked; "0", "unspecified" and absent do not.
 */
export function browserSendsDoNotTrack(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & {
    msDoNotTrack?: string | null;
  };
  const signals = [
    nav.doNotTrack,
    (window as Window & { doNotTrack?: string | null }).doNotTrack,
    nav.msDoNotTrack,
  ];
  return signals.some((signal) => signal === "1" || signal === "yes");
}

/**
 * Apply a person's stored analytics choice to this browser (#715).
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
  if (!posthog.__loaded) return;

  if (optedOut) {
    posthog.opt_out_capturing();
    return;
  }

  if (browserSendsDoNotTrack()) return;
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
}
