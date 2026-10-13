// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as string[], running: false }));

vi.mock("@/lib/posthog", () => ({
  initPostHog: () => h.calls.push("posthog:init"),
  withdrawPostHog: () => {
    h.calls.push("posthog:withdraw");
    return h.running;
  },
}));
vi.mock("./sentry-replay", () => ({
  startSentryReplay: () => h.calls.push("replay:start"),
  stopSentryReplay: () => h.calls.push("replay:stop"),
}));

import { applyConsentChoice } from "./apply";
import {
  __resetConsentMemoryForTests,
  markShownCounted,
  readConsent,
  setAccountAnalyticsOff,
} from "./store";

beforeEach(() => {
  h.calls = [];
  h.running = false;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
});

describe("applyConsentChoice", () => {
  it("Accept stores the answer and starts PostHog and replay, with no reload", () => {
    expect(applyConsentChoice("accepted").reload).toBe(false);
    expect(readConsent()?.choice).toBe("accepted");
    expect(h.calls).toEqual(["posthog:init", "replay:start"]);
  });

  it("Accept never starts replay for an account this device knows is opted out", () => {
    setAccountAnalyticsOff(true);
    applyConsentChoice("accepted");
    expect(readConsent()?.choice).toBe("accepted");
    expect(h.calls).not.toContain("replay:start");
  });

  it("Accept when already accepted changes nothing and never reloads", () => {
    applyConsentChoice("accepted");
    h.calls = [];
    expect(applyConsentChoice("accepted")).toEqual({
      countAnswer: false,
      reload: false,
    });
    expect(h.calls).toEqual([]);
  });

  it("Decline with nothing running stores the answer and needs no reload", () => {
    expect(applyConsentChoice("declined").reload).toBe(false);
    expect(readConsent()?.choice).toBe("declined");
    expect(h.calls).toEqual(["replay:stop", "posthog:withdraw"]);
  });

  it("Decline while PostHog is running asks for a reload", () => {
    applyConsentChoice("accepted");
    h.running = true;
    expect(applyConsentChoice("declined").reload).toBe(true);
  });

  it("counts an answer only when it is the first, and only when the showing was counted", () => {
    // The showing was never counted, so the answer is not either.
    expect(applyConsentChoice("declined").countAnswer).toBe(false);
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    markShownCounted();
    expect(applyConsentChoice("declined").countAnswer).toBe(true);
    // A change of mind, not a first answer.
    expect(applyConsentChoice("accepted").countAnswer).toBe(false);
  });
});
