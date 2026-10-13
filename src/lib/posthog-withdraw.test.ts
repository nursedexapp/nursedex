// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withdrawPostHog } from "./posthog";
import {
  clickAButton,
  postHogIdentityKeys,
  startRealPostHog,
} from "../../test/real-posthog";

/**
 * Against the real posthog-js, not a mock: what withdrawPostHog has to stop
 * is the library's own autocapture and unload handler, which captures
 * $pageleave and sends it by beacon (posthog-core.js _handle_unload).
 *
 * Nothing reaches the network (test/real-posthog.ts). `captured` is every
 * event that got past before_send, so an event still waiting in the batch
 * queue counts as much as one already sent.
 */
let ph: ReturnType<typeof startRealPostHog>;

beforeEach(() => {
  ph = startRealPostHog();
});

afterEach(() => {
  ph.teardown();
});

const leave = () => window.dispatchEvent(new Event("pagehide"));

describe("withdrawPostHog on the real library", () => {
  it("captures and sends nothing more from the page, a button click and the unload pageleave included, and never opts out", () => {
    // Control: before withdrawal a call, a click on a button and leaving the
    // page are all captured, and leaving sends them.
    ph.posthog.capture("before_withdrawal");
    clickAButton();
    leave();
    expect(ph.captured).toEqual([
      "before_withdrawal",
      "$autocapture",
      "$pageleave",
    ]);
    expect(ph.sent.some((s) => s.startsWith("beacon:"))).toBe(true);

    ph.captured.length = 0;
    ph.sent.length = 0;
    expect(withdrawPostHog()).toBe(true);
    ph.posthog.capture("after_withdrawal");
    clickAButton();
    leave();
    expect(ph.captured).toEqual([]);
    expect(ph.sent).toEqual([]);
    // PostHog's own opt-out record may carry the ACCOUNT's choice: untouched.
    expect(ph.posthog.has_opted_out_capturing()).toBe(false);
  });

  it("writes no identity back once withdrawn", () => {
    // Runs after the test above withdrew the shared instance, so this also
    // proves the helper put the singleton back: PostHog is running again.
    ph.posthog.capture("before_withdrawal");
    expect(ph.captured).toEqual(["before_withdrawal"]);
    expect(postHogIdentityKeys().length).toBeGreaterThan(0);

    withdrawPostHog();
    window.localStorage.clear();
    window.sessionStorage.clear();
    ph.posthog.capture("after_withdrawal");
    clickAButton();
    expect(
      postHogIdentityKeys().filter((k) => !k.startsWith("cookie:")),
    ).toEqual([]);
  });
});
