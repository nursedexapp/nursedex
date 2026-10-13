// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * #715. This component is where a person's stored analytics choice reaches a
 * browser that has never seen it: a new laptop, a different browser, cleared
 * storage. PostHog persists an opt-out in the browser's own storage, so on a
 * device where the choice was made it is already in force; this is the path
 * that carries it to a device where it is not.
 *
 * The consent store is real, so the cookie banner's answer is what decides
 * whether PostHog may start, as it is in the app.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  distinctId: "anonymous",
  posthog: { __loaded: false },
}));

vi.mock("@/lib/posthog", async () => {
  const { analyticsAllowed } = await import("@/lib/consent/store");
  const posthog = Object.assign(h.posthog, {
    get_distinct_id: () => h.distinctId,
    identify: (id: string) => h.calls.push(`identify:${id}`),
  });
  return {
    // The real one refuses until the browser accepted and the account allows it.
    initPostHog: () => {
      h.calls.push("init");
      if (!posthog.__loaded && analyticsAllowed()) posthog.__loaded = true;
    },
    posthog,
  };
});

vi.mock("@/lib/analytics/preference", async () => {
  const { setAccountAnalyticsOff } = await import("@/lib/consent/store");
  return {
    applyAnalyticsPreference: (optedOut: boolean) => {
      h.calls.push(`preference:${optedOut}`);
      setAccountAnalyticsOff(optedOut);
    },
  };
});

import { PostHogIdentify } from "./PostHogIdentify";
import {
  __resetConsentMemoryForTests,
  writeConsent,
} from "@/lib/consent/store";

beforeEach(() => {
  h.calls.length = 0;
  h.distinctId = "anonymous";
  h.posthog.__loaded = false;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  writeConsent("accepted");
});

afterEach(cleanup);

describe("PostHogIdentify", () => {
  it("identifies somebody who has not opted out", () => {
    render(
      <PostHogIdentify
        userId="user-1"
        email="a@b.com"
        analyticsOptOut={false}
      />,
    );
    expect(h.calls).toContain("identify:user-1");
  });

  it("applies the opt-out and does not identify", () => {
    // Identifying an opted-out person is itself a capture, and it is the one
    // that attaches their email to a PostHog profile. Doing it "first, then
    // opting out" would ship the exact thing they asked us not to.
    render(<PostHogIdentify userId="user-1" email="a@b.com" analyticsOptOut />);
    expect(h.calls).toContain("preference:true");
    expect(h.calls.some((c) => c.startsWith("identify:"))).toBe(false);
  });

  it("applies the preference before identifying", () => {
    render(<PostHogIdentify userId="user-1" analyticsOptOut={false} />);
    const preference = h.calls.indexOf("preference:false");
    const identify = h.calls.indexOf("identify:user-1");
    expect(preference).toBeGreaterThanOrEqual(0);
    expect(identify).toBeGreaterThan(preference);
  });

  it("still applies the preference when the person is already identified", () => {
    // The early return for an already-identified person must not skip the
    // preference, or a choice made on another device would never land here.
    h.distinctId = "user-1";
    render(<PostHogIdentify userId="user-1" analyticsOptOut />);
    expect(h.calls).toContain("preference:true");
  });

  it("records an opt-out on this device before anything can start PostHog", () => {
    // The banner's gate reads the account setting from this device. If it is
    // recorded only once PostHog is running, an opted out person who accepts
    // the banner starts PostHog, and the pageview goes out before the opt-out.
    render(<PostHogIdentify userId="user-1" analyticsOptOut />);
    expect(h.calls[0]).toBe("preference:true");
    expect(h.posthog.__loaded).toBe(false);
  });

  it("does not identify in a browser that has not accepted the banner", () => {
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    render(<PostHogIdentify userId="user-1" analyticsOptOut={false} />);
    expect(h.calls.some((c) => c.startsWith("identify:"))).toBe(false);
  });

  it("does not identify while analytics are not allowed, even with PostHog running", () => {
    // PostHog left running on the page after the answer changed is the case
    // the loaded check alone would let through.
    h.posthog.__loaded = true;
    writeConsent("declined");
    render(<PostHogIdentify userId="user-1" analyticsOptOut={false} />);
    expect(h.calls.some((c) => c.startsWith("identify:"))).toBe(false);
  });

  it("identifies once the banner is accepted on the same page", () => {
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    render(<PostHogIdentify userId="user-1" analyticsOptOut={false} />);
    expect(h.calls).not.toContain("identify:user-1");
    act(() => writeConsent("accepted"));
    expect(h.calls).toContain("identify:user-1");
  });
});
