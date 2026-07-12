// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

vi.mock("@/lib/subscriptions/actions", () => ({
  createFamilyAccessCheckout: vi.fn(),
  createNurseFeaturedCheckout: vi.fn(),
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({
  posthog: { __loaded: true, capture: (...a: unknown[]) => capture(...a) },
}));

import { CheckoutButton } from "./CheckoutButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import {
  createFamilyAccessCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { toast } from "sonner";

// Phase 3 of #443. Money buttons: `wait` mode. A checkout session cannot be
// aborted once it is in flight, so a stall never hands the button back.
//
// #657 also asks for the PostHog fix. SUBSCRIPTION_STARTED used to fire in the
// click handler, before the action ran, so a checkout that errored still counted
// a "start" that never reached Stripe, and the next attempt counted another one.
// It now fires only once a session actually exists.

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

// A hung action has to be released before the next test starts: React entangles
// concurrent async actions through state shared across the module, so one left in
// flight stops the NEXT test's transition from ever settling.
const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ error: "cleanup" }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup() {
  render(
    <CheckoutButton
      action="family_access_checkout"
      label="Get Family Access"
      className="w-full"
    />,
  );
  return {
    click: async (name: RegExp | string) => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name }));
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

describe("a checkout that is in flight", () => {
  it("shows it is running and blocks a second click", async () => {
    vi.mocked(createFamilyAccessCheckout).mockReturnValue(hang());
    const { click } = setup();

    await click("Get Family Access");

    expect(screen.getByRole("button")).toBeDisabled();
    expect(createFamilyAccessCheckout).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(createFamilyAccessCheckout).mockReturnValue(hang());
    const { click } = setup();

    await click("Get Family Access");
    await advance(STALL_MS);

    // The user is told what is happening. What they are not given is a button
    // that could open a second Stripe session.
    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("cannot be fired again by clicking through the stall message", async () => {
    vi.mocked(createFamilyAccessCheckout).mockReturnValue(hang());
    const { click } = setup();

    await click("Get Family Access");
    await advance(STALL_MS);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(createFamilyAccessCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("the funnel is only counted when a checkout really starts", () => {
  it("counts nothing when the session could not be created", async () => {
    // The bug #657 names. The capture used to fire on click, so a checkout that
    // never reached Stripe still counted as a subscription start.
    vi.mocked(createFamilyAccessCheckout).mockResolvedValue({
      error: "Stripe is down",
    });
    const { click } = setup();

    await click("Get Family Access");

    expect(toast.error).toHaveBeenCalledWith("Stripe is down");
    expect(capture).not.toHaveBeenCalled();
  });

  it("counts one start per session, not one per attempt", async () => {
    // Fail, then succeed. The old code counted two starts for one subscription.
    vi.mocked(createFamilyAccessCheckout)
      .mockResolvedValueOnce({ error: "Stripe is down" })
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/x" });
    const { click } = setup();

    await click("Get Family Access");
    await click("Get Family Access");

    const starts = capture.mock.calls.filter(
      (c) => c[0] === ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
    );
    expect(starts).toHaveLength(1);
    expect(starts[0][1]).toMatchObject({
      plan: "family_access",
      interval: "month",
      source: "pricing_page",
    });
    expect(redirectToCheckout).toHaveBeenCalledTimes(1);
  });
});
