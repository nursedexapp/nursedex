// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #715. This component is where a person's stored analytics choice reaches a
 * browser that has never seen it: a new laptop, a different browser, cleared
 * storage. PostHog persists an opt-out in the browser's own storage, so on a
 * device where the choice was made it is already in force; this is the path
 * that carries it to a device where it is not.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  distinctId: "anonymous",
}));

vi.mock("@/lib/posthog", () => ({
  initPostHog: () => h.calls.push("init"),
  posthog: {
    __loaded: true,
    get_distinct_id: () => h.distinctId,
    identify: (id: string) => h.calls.push(`identify:${id}`),
  },
}));

vi.mock("@/lib/analytics/preference", () => ({
  applyAnalyticsPreference: (optedOut: boolean) =>
    h.calls.push(`preference:${optedOut}`),
}));

import { PostHogIdentify } from "./PostHogIdentify";

beforeEach(() => {
  h.calls.length = 0;
  h.distinctId = "anonymous";
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
});
