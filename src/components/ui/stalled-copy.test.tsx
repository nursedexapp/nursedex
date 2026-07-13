// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  stalledMessageFor,
  PAYMENT_STALLED,
  BILLING_PORTAL_STALLED,
  RETRY_STALLED,
  GENERIC_OUTCOME,
} from "./stalled-copy";

// #673. Milestone #443 left 21 distinct near-identical stalled messages behind,
// one per call site, and they had drifted: every one of those buttons is in wait
// mode, but only 14 of the messages told the user to stay on the page. The
// sentence has three slots and one rule, and this is where both live.

describe("stalledMessageFor", () => {
  it("tells a wait-mode user not to close the page, because the side effect may already have happened", () => {
    // wait mode means firing again duplicates something real: a second email, a
    // second charge, a second row. Leaving the page is how they lose the receipt.
    expect(stalledMessageFor("wait", "the post was deleted")).toBe(
      "This is still processing. Please do not close this page. Refresh to check whether the post was deleted.",
    );
  });

  it("leaves that warning out in retry mode, where firing again is safe", () => {
    expect(stalledMessageFor("retry", "your comment went through")).toBe(
      "This is still processing. Refresh to check whether your comment went through.",
    );
  });

  it("takes a verb, so a send reads as sending rather than processing", () => {
    expect(
      stalledMessageFor("wait", "your review went through", "sending"),
    ).toBe(
      "This is still sending. Please do not close this page. Refresh to check whether your review went through.",
    );
    expect(
      stalledMessageFor("wait", "the hire was recorded", "recording"),
    ).toBe(
      "This is still recording. Please do not close this page. Refresh to check whether the hire was recorded.",
    );
  });

  it("falls back to a generic outcome when the caller has nothing specific to say", () => {
    expect(stalledMessageFor("wait", GENERIC_OUTCOME)).toBe(
      "This is still processing. Please do not close this page. Refresh to check whether it went through.",
    );
  });

  it("offers a retry rather than a refresh when a retryable action names no outcome", () => {
    // There is a live button under this message, so "go again" beats "refresh
    // and check".
    expect(stalledMessageFor("retry")).toBe(RETRY_STALLED);
  });

  it("still warns a wait-mode action with no outcome, rather than offering a retry", () => {
    // The dangerous default. A wait-mode action with nothing specific to say
    // must NOT fall through to "you can try again": firing again is the exact
    // thing wait mode exists to prevent.
    expect(stalledMessageFor("wait")).toBe(
      "This is still processing. Please do not close this page. Refresh to check whether it went through.",
    );
    expect(stalledMessageFor("wait")).not.toContain("try again");
  });

  it("never doubles the full stop when the outcome is written with one", () => {
    // The caller passes a clause, not a sentence. Being forgiving about a stray
    // full stop is cheaper than 26 call sites getting it subtly wrong.
    expect(stalledMessageFor("retry", "you were unsubscribed.")).toBe(
      "This is still processing. Refresh to check whether you were unsubscribed.",
    );
  });
});

describe("the two Stripe variants", () => {
  it("tells a stalled checkout that no money moved", () => {
    // A hung redirect to checkout is the one place a user genuinely fears they
    // have been charged twice. Saying so is the whole point of the variant.
    expect(PAYMENT_STALLED).toContain("You have not been charged");
  });

  it("does NOT say that when merely opening the billing portal", () => {
    // These two look like the same sentence drifting apart, and they are not.
    // Clicking Manage subscription never charges anyone, so "You have not been
    // charged" would answer a question the user was not asking. Keep them apart.
    expect(BILLING_PORTAL_STALLED).not.toContain("charged");
    expect(BILLING_PORTAL_STALLED).toBe(
      "This is still opening Stripe. Refresh the page to try again.",
    );
  });
});
