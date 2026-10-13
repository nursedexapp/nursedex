import { initPostHog, withdrawPostHog } from "@/lib/posthog";
import { startSentryReplay, stopSentryReplay } from "./sentry-replay";
import {
  analyticsAllowed,
  readConsent,
  shownCounted,
  writeConsent,
  type ConsentChoice,
} from "./store";

/**
 * What Accept and Decline do in this browser.
 *
 * countAnswer: true only for this browser's first answer in the period, and
 * only if its showing was counted, so the tally's answers can never outnumber
 * its showings.
 *
 * reload: true only for Decline while PostHog is running on this page. The
 * in memory stop (withdrawTracking) holds for the life of the page, and the
 * reload also clears PostHog from memory, so the next load never starts it.
 * The banner was just pressed, so nothing typed is lost. Accept never reloads,
 * so unsaved form input is never lost to it (L608).
 */
export function applyConsentChoice(choice: ConsentChoice): {
  countAnswer: boolean;
  reload: boolean;
} {
  const previous = readConsent();
  if (previous?.choice === choice) return { countAnswer: false, reload: false };

  const countAnswer = previous === null && shownCounted();
  writeConsent(choice);

  if (choice === "declined") {
    return { countAnswer, reload: withdrawTracking() };
  }

  // Both refuse an account this device knows is opted out: initPostHog gates
  // itself, replay is gated here.
  initPostHog();
  if (analyticsAllowed()) startSentryReplay();
  return { countAnswer, reload: false };
}

/**
 * Stops everything that tracks on this page, in memory: Sentry replay and,
 * when it is running, PostHog (see withdrawPostHog). The one withdrawal, used
 * by Decline in this tab and by PostHogProvider when the answer or the account
 * setting changes underneath the page, including from another tab. Returns
 * true when PostHog was running, which is when the banner reloads the tab the
 * visitor declined in. Another tab is never reloaded: it may hold unsaved
 * input (L608), and the in memory stop is complete for the life of the page.
 */
export function withdrawTracking(): boolean {
  stopSentryReplay();
  return withdrawPostHog();
}
