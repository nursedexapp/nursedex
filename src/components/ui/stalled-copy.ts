import type { StallMode } from "@/components/ui/pending-button";

// The one place the stalled-action copy lives (#673).
//
// Milestone #443 gave every async button a stall message and left 21 distinct
// near-identical copies of it behind, each a local const or an inline literal
// across admin, reviews, hires, blog, pricing and dashboard. Changing the tone,
// adding a support link, or ever localising the app meant hunting all 21 down.
//
// The sentence was always the same shape with three slots:
//
//   This is still {verb}. [Please do not close this page.] Refresh to check
//   whether {outcome}.
//
// and it had genuinely drifted. Every one of those 21 buttons is in `wait` mode,
// meaning a second fire duplicates a real side effect (a second email to a nurse,
// a second comment, a second hire row), so staying on the page is exactly what
// the user should do. But only 14 of the messages said so: the contact form, the
// comment box, the unsubscribe and four others simply never got the sentence,
// with no principle separating them from the ones that did. The rule now is the
// mode: `wait` always warns, `retry` never does, because a retry-mode button is
// still there to be pressed.
//
// So callers do not write the sentence. They pass the mode they already have,
// plus the clause that says what to look for.

/** What the action is busy doing. Completes "This is still ___." */
export type StalledVerb =
  | "processing"
  | "sending"
  | "recording"
  | "uploading"
  | "saving"
  | "signing out";

/** When the caller has nothing more specific to point the user at. */
export const GENERIC_OUTCOME = "it went through";

/**
 * Stripe checkout, where the reassurance IS the message.
 *
 * Kept whole rather than built, because it does not follow the shape: there is
 * nothing to refresh and check, and the only thing worth saying is that no money
 * moved.
 */
export const PAYMENT_STALLED =
  "This is still opening Stripe. You have not been charged. Refresh the page to try again.";

/**
 * Opening the Stripe billing portal, which is NOT a payment.
 *
 * Deliberately does not carry PAYMENT_STALLED's "You have not been charged":
 * clicking Manage subscription never charges anyone, so the reassurance would
 * answer a question the user was not asking. The two are separate on purpose,
 * not by drift.
 */
export const BILLING_PORTAL_STALLED =
  "This is still opening Stripe. Refresh the page to try again.";

/**
 * What a stalled retry-mode action says when the caller names no outcome.
 *
 * It does not follow the shape either: there is a live button underneath it, so
 * the useful thing to say is "go again", not "refresh and check".
 */
export const RETRY_STALLED =
  "This is taking longer than usual. You can try again.";

/**
 * Build the stalled message for an action.
 *
 * `outcome` is a clause, not a sentence: it completes "Refresh to check whether
 * ___". Write it as the user would ask it ("the post was deleted", "your review
 * went through"), and leave the full stop to this function. Omit it only when
 * there is genuinely nothing specific to point them at.
 */
export function stalledMessageFor(
  mode: StallMode,
  outcome?: string,
  verb: StalledVerb = "processing",
): string {
  if (!outcome?.trim()) {
    return mode === "retry"
      ? RETRY_STALLED
      : stalledMessageFor("wait", GENERIC_OUTCOME, verb);
  }

  const clause = outcome.trim().replace(/\.+$/, "");
  const doNotClose = mode === "wait" ? " Please do not close this page." : "";

  return `This is still ${verb}.${doNotClose} Refresh to check whether ${clause}.`;
}
