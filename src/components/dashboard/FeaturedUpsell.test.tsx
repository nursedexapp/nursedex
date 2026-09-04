// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";

const captured: { event: string; properties?: Record<string, unknown> }[] = [];
/** Whether the fake PostHog manages to send. False stands for "not loaded yet". */
let captureSucceeds = true;

vi.mock("@/lib/analytics/capture", () => ({
  captureClientEvent: (event: string, properties?: Record<string, unknown>) => {
    if (!captureSucceeds) return false;
    captured.push({ event, properties });
    return true;
  },
}));

import { FeaturedUpsell } from "./FeaturedUpsell";

/**
 * Featured is the only paid product aimed at the audience this site actually
 * acquires, and until now nothing recorded whether a nurse ever saw the offer.
 * The one sighting event that existed fired from a toast shown when a FAMILY
 * saved the nurse's profile, which has happened nine times in the product's
 * life, so the number measured family activity rather than the offer (#969).
 *
 * Seen and clicked are what separate "no nurse has ever laid eyes on it" from
 * "they see it and it does not persuade them", and those point at completely
 * different fixes.
 */

let observed: { element: Element; fire: (isIntersecting: boolean) => void }[] =
  [];

class FakeIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(element: Element) {
    observed.push({
      element,
      fire: (isIntersecting) =>
        this.cb(
          [{ isIntersecting, target: element } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
    });
  }
  disconnect() {}
  unobserve() {}
}

/**
 * next/link registers its OWN IntersectionObserver on the same anchor for
 * prefetching, so firing observed[0] fires whichever happened to register
 * first. Fire them all and let each callback decide.
 */
function fireAll(isIntersecting: boolean) {
  for (const o of observed) o.fire(isIntersecting);
}

beforeEach(() => {
  captureSucceeds = true;
  captured.length = 0;
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FeaturedUpsell", () => {
  it("records a sighting the first time the prompt is on screen", () => {
    render(<FeaturedUpsell isVerified={true} />);

    act(() => fireAll(true));

    expect(captured).toEqual([
      { event: "featured_upsell_shown", properties: { surface: "dashboard" } },
    ]);
  });

  it("records the sighting once, however many times it scrolls back into view", () => {
    render(<FeaturedUpsell isVerified={true} />);

    act(() => fireAll(true));
    act(() => fireAll(false));
    act(() => fireAll(true));

    expect(captured).toHaveLength(1);
  });

  /**
   * The failure that matters: PostHog initializes inside a Suspense boundary,
   * so a capture can run before it is ready and be dropped. Marking the
   * sighting done at that moment loses it for the whole page load, which is
   * exactly the defect that made the homepage number wrong.
   */
  it("does not mark the sighting done when the capture is dropped", () => {
    captureSucceeds = false;
    render(<FeaturedUpsell isVerified={true} />);

    act(() => fireAll(true));
    expect(captured).toHaveLength(0);

    captureSucceeds = true;
    act(() => fireAll(true));

    expect(captured).toEqual([
      { event: "featured_upsell_shown", properties: { surface: "dashboard" } },
    ]);
  });

  it("records a click when the nurse follows the link to pricing", () => {
    render(<FeaturedUpsell isVerified={true} />);

    fireEvent.click(screen.getByRole("link"));

    expect(captured).toEqual([
      {
        event: "featured_upsell_clicked",
        properties: { surface: "dashboard" },
      },
    ]);
  });

  /**
   * An unverified nurse is shown no upsell at all, so there is nothing to see
   * and a sighting recorded for her would inflate the very number this exists
   * to make trustworthy.
   */
  it("renders nothing and records nothing for a nurse who is not verified", () => {
    render(<FeaturedUpsell isVerified={false} />);

    act(() => fireAll(true));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(captured).toHaveLength(0);
  });
});
