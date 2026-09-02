// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  /** Whether calling init actually manages to load PostHog. */
  initSucceeds: true,
  loaded: false,
  captured: [] as string[],
  initCalls: 0,
}));

vi.mock("@/lib/posthog", () => ({
  initPostHog: () => {
    h.initCalls += 1;
    if (h.initSucceeds) h.loaded = true;
  },
  posthog: {
    get __loaded() {
      return h.loaded;
    },
    capture: (event: string) => {
      h.captured.push(event);
    },
  },
}));

import { captureClientEvent } from "./capture";
import { ANALYTICS_EVENTS } from "./events";

beforeEach(() => {
  h.initSucceeds = true;
  h.loaded = false;
  h.captured.length = 0;
  h.initCalls = 0;
});

/**
 * Found in production rather than in a test: after #869 shipped, a real visit
 * to the homepage recorded its $pageview but no homepage_cta_seen at all.
 *
 * PostHogProvider initializes PostHog inside a Suspense boundary, so another
 * component's effect can run FIRST. A capture at that moment saw
 * posthog.__loaded as false and returned silently, and the caller had no way to
 * tell, so the event was not delayed, it was lost. PostHogIdentify already
 * called initPostHog defensively for exactly this reason; every other caller
 * did not.
 */
describe("captureClientEvent", () => {
  it("initializes PostHog rather than silently dropping the first event", () => {
    const captured = captureClientEvent(ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN);

    expect(h.initCalls).toBe(1);
    expect(h.captured).toEqual(["homepage_cta_seen"]);
    expect(captured).toBe(true);
  });

  it("captures normally when PostHog is already loaded", () => {
    h.loaded = true;
    expect(captureClientEvent(ANALYTICS_EVENTS.HOMEPAGE_CTA_CLICKED)).toBe(true);
    expect(h.captured).toEqual(["homepage_cta_clicked"]);
  });

  it("says it did NOT capture when PostHog cannot load at all", () => {
    // No keys, or an ad blocker that beat the proxy. The answer matters: a
    // caller that treats a drop as a success marks the event done and never
    // sends it, which is how a measurement disappears without a trace.
    h.initSucceeds = false;

    expect(captureClientEvent(ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN)).toBe(false);
    expect(h.captured).toEqual([]);
  });
});
