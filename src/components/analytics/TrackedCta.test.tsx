// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";

const captured: { event: string; properties?: Record<string, unknown> }[] = [];

vi.mock("@/lib/analytics/capture", () => ({
  captureClientEvent: (event: string, properties?: Record<string, unknown>) => {
    captured.push({ event, properties });
  },
}));

import { TrackedCta } from "./TrackedCta";

/**
 * The homepage is where the business loses everyone, and the three possible
 * reasons (never reached the button, reached it and ignored it, or clicked it)
 * point at completely different fixes. Seen and clicked are what tell them
 * apart, so both are pinned here, including the case where the button is never
 * reached, which is the one the numbers currently suggest is commonest.
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
  captured.length = 0;
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCta() {
  return render(
    <TrackedCta href="/nurses" audience="families" cta="browse_nurses" placement="hero">
      Browse nurses
    </TrackedCta>,
  );
}

describe("TrackedCta", () => {
  it("says nothing until the button is actually on screen", () => {
    renderCta();
    expect(captured).toEqual([]);
  });

  it("records that the call to action was seen, once it is", () => {
    renderCta();
    act(() => fireAll(true));

    expect(captured).toEqual([
      {
        event: "homepage_cta_seen",
        properties: {
          audience: "families",
          cta: "browse_nurses",
          placement: "hero",
        },
      },
    ]);
  });

  it("counts one sighting, not one per scroll past", () => {
    renderCta();
    act(() => fireAll(true));
    act(() => fireAll(false));
    act(() => fireAll(true));

    expect(captured.filter((c) => c.event === "homepage_cta_seen")).toHaveLength(
      1,
    );
  });

  it("records a click, and which of the two audiences it belongs to", () => {
    renderCta();
    act(() => fireAll(true));
    fireEvent.click(screen.getByRole("link", { name: "Browse nurses" }));

    expect(captured.map((c) => c.event)).toEqual([
      "homepage_cta_seen",
      "homepage_cta_clicked",
    ]);
    expect(captured[1].properties).toEqual({
      audience: "families",
      cta: "browse_nurses",
      placement: "hero",
    });
  });

  it("records a click from someone who never triggered the seen event", () => {
    // The measurement is a passenger, never a gate. Someone who lands mid page
    // with the button already rendered still has their click counted, and the
    // link still carries its real href.
    renderCta();

    const link = screen.getByRole("link", { name: "Browse nurses" });
    expect(link).toHaveAttribute("href", "/nurses");
    fireEvent.click(link);

    expect(captured.map((c) => c.event)).toEqual(["homepage_cta_clicked"]);
  });
});
