// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const h = vi.hoisted(() => {
  const state = { search: "" };
  return {
    state,
    refresh: vi.fn(),
    capture: vi.fn(),
    posthog: { __loaded: false, capture: (...a: unknown[]) => a },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.state.search),
}));
vi.mock("@/lib/reveals/actions", () => ({ revealNurse: vi.fn() }));
vi.mock("@/lib/subscriptions/actions", () => ({
  createFamilyAccessCheckout: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("@/lib/posthog", () => ({
  posthog: {
    get __loaded() {
      return h.posthog.__loaded;
    },
    capture: (...a: unknown[]) => h.capture(...a),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RevealCTA } from "./RevealCTA";
import { STALL_MS } from "@/components/ui/pending-button";
import { revealNurse } from "@/lib/reveals/actions";
import { toast } from "sonner";
import { createFamilyAccessCheckout } from "@/lib/subscriptions/actions";

beforeEach(() => {
  h.state.search = "";
  h.posthog.__loaded = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("RevealCTA no_sub mode", () => {
  it("shows the paywall trigger when there is no provisioning marker", () => {
    render(
      <RevealCTA
        nurseUserId="n1"
        nurseFirstName="Sam"
        returnTo="/nurses/sam"
        mode="no_sub"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Reveal contact info/ }),
    ).toBeInTheDocument();
  });

  it("shows a provisioning notice instead of the paywall right after checkout (#426)", () => {
    h.state.search = "provisioning=pending";
    render(
      <RevealCTA
        nurseUserId="n1"
        nurseFirstName="Sam"
        returnTo="/nurses/sam"
        mode="no_sub"
      />,
    );

    expect(
      screen.getByText(/Finishing your subscription/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reveal contact info/ }),
    ).not.toBeInTheDocument();
  });
});

// Phase 3 of #443. A reveal burns one of the family's capped daily slots (#653)
// and a checkout opens a Stripe session, so both are `wait` mode: on a stall the
// button stays dead rather than handing back a control that spends something.
describe("a reveal that never comes back", () => {
  const hung: Array<(value: unknown) => void> = [];

  function hang<T>(): Promise<T> {
    return new Promise<T>((resolve) => {
      hung.push(resolve as (value: unknown) => void);
    });
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(async () => {
    await act(async () => {
      hung.splice(0).forEach((resolve) => resolve({ success: false }));
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.useRealTimers();
  });

  async function clickReveal() {
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /reveal contact info|revealing/i }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  function renderSubscribed() {
    render(
      <RevealCTA
        nurseUserId="n1"
        nurseFirstName="Sam"
        returnTo="/nurses/sam"
        mode="subscribed"
      />,
    );
  }

  it("blocks a second reveal while the first is running", async () => {
    vi.mocked(revealNurse).mockReturnValue(hang());
    renderSubscribed();

    await clickReveal();

    expect(screen.getByRole("button")).toBeDisabled();
    expect(revealNurse).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a stall, because a repeat now spends nothing", async () => {
    // #653 was the reason this stayed dead: a concurrent reveal could burn a
    // second slot from the family's capped daily allowance for one nurse.
    // Migration 059 made the check, the spend and the write one transaction, so
    // a repeat spends nothing and hands back the contact they already own. The
    // retry is safe, and a family whose reveal hangs no longer has to refresh.
    vi.mocked(revealNurse).mockReturnValue(hang());
    renderSubscribed();

    await clickReveal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await act(async () => {
      fireEvent.click(again);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(revealNurse).toHaveBeenCalledTimes(2);
  });

  it("does not let the superseded reveal report over the retry", async () => {
    // The hung first request is still in flight. If it lands after the retry it
    // must stay quiet, or it toasts an error over a reveal that worked.
    let releaseFirst!: (v: unknown) => void;
    vi.mocked(revealNurse)
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseFirst = r as (v: unknown) => void;
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        contact: {
          email: "a@b.c",
          phone: null,
          communication_preference: null,
        },
      });

    renderSubscribed();
    await clickReveal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    vi.mocked(toast.error).mockClear();

    await act(async () => {
      releaseFirst({ success: false, error: "unknown" });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("hands the button back when the reveal really fails", async () => {
    vi.mocked(revealNurse).mockResolvedValue({
      success: false,
      error: "rate_limited",
    });
    renderSubscribed();

    await clickReveal();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal contact info/i }),
    ).toBeEnabled();
  });
});

describe("the paywall's checkout", () => {
  const hung: Array<(value: unknown) => void> = [];

  function hang<T>(): Promise<T> {
    return new Promise<T>((resolve) => {
      hung.push(resolve as (value: unknown) => void);
    });
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(async () => {
    await act(async () => {
      hung.splice(0).forEach((resolve) => resolve({ error: "cleanup" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.useRealTimers();
  });

  async function openPaywallAndSubscribe() {
    render(
      <RevealCTA
        nurseUserId="n1"
        nurseFirstName="Sam"
        returnTo="/nurses/sam"
        mode="no_sub"
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /reveal contact info/i }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /first year/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("stays disabled on a stall and never opens a second Stripe session", async () => {
    vi.mocked(createFamilyAccessCheckout).mockReturnValue(hang());
    await openPaywallAndSubscribe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /redirecting/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(createFamilyAccessCheckout).toHaveBeenCalledTimes(1);
  });

  it("blocks the monthly option while the annual one is in flight", async () => {
    vi.mocked(createFamilyAccessCheckout).mockReturnValue(hang());
    await openPaywallAndSubscribe();

    expect(
      screen.getByRole("button", { name: /subscribe monthly/i }),
    ).toBeDisabled();
    expect(createFamilyAccessCheckout).toHaveBeenCalledTimes(1);
  });

  it("counts the funnel only once a checkout session really exists", async () => {
    // Same defect #657 names in CheckoutButton: SUBSCRIPTION_STARTED fired on
    // click, so a checkout that never reached Stripe still counted a start.
    h.posthog.__loaded = true;
    vi.mocked(createFamilyAccessCheckout).mockResolvedValue({
      error: "Stripe is down",
    });
    await openPaywallAndSubscribe();

    expect(h.capture).not.toHaveBeenCalled();
  });
});
