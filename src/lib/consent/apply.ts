import { initPostHog, withdrawPostHog } from "@/lib/posthog";
import { startSentryReplay, stopSentryReplay } from "./sentry-replay";
import { readConsent, shownCounted, writeConsent, type ConsentChoice } from "./store";

/**
 * What Accept and Decline do in this browser.
 *
 * countAnswer: true only for this browser's first answer in the period, and
 * only if its showing was counted, so the tally's answers can never outnumber
 * its showings.
 *
 * reload: true only for Decline while PostHog is running on this page.
 * posthog-js cannot be fully stopped in memory, so the page reloads and the
 * next load never starts it. Accept never reloads, so unsaved form input is
 * never lost to it (L608).
 */
export function applyConsentChoice(choice: ConsentChoice): { countAnswer: boolean; reload: boolean } {
  const previous = readConsent();
  if (previous?.choice === choice) return { countAnswer: false, reload: false };

  const countAnswer = previous === null && shownCounted();
  writeConsent(choice);

  if (choice === "declined") {
    stopSentryReplay();
    const reload = withdrawPostHog();
    return { countAnswer, reload };
  }

  initPostHog();
  startSentryReplay();
  return { countAnswer, reload: false };
}
