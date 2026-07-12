// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { STALL_MS } from "@/components/ui/pending-button";

vi.mock("@/lib/subscriptions/actions", () => ({
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { ManageSubscriptionCard } from "./ManageSubscriptionCard";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const RENEWS_ON = "2026-07-13T12:00:00Z";

const base = {
  planLabel: "Family Access",
  renewsOn: RENEWS_ON,
  cancelAtPeriodEnd: false,
  isPastDue: false,
  returnTo: "/dashboard/settings",
};

describe("ManageSubscriptionCard", () => {
  it("shows the renewal date and a manage button for an active sub", () => {
    render(<ManageSubscriptionCard {...base} />);
    expect(screen.getByText(/Family Access renews on/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage subscription" }),
    ).toBeInTheDocument();
  });

  it("softens the copy to an end date when cancellation is scheduled", () => {
    render(
      <ManageSubscriptionCard
        {...base}
        planLabel="Featured"
        cancelAtPeriodEnd
      />,
    );
    expect(
      screen.getByText(/Featured cancellation scheduled\. Access ends on/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/renews on/)).not.toBeInTheDocument();
  });

  it("steers a past-due sub toward updating payment with a Payment failed badge", () => {
    render(<ManageSubscriptionCard {...base} isPastDue />);
    expect(
      screen.getByText(/Update payment to keep Family Access/),
    ).toBeInTheDocument();
    expect(screen.getByText("Payment failed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update payment" }),
    ).toBeInTheDocument();
  });

  it("renders the Featured badge only when featured is set", () => {
    const { rerender } = render(<ManageSubscriptionCard {...base} />);
    expect(screen.queryByText("Featured")).not.toBeInTheDocument();

    rerender(
      <ManageSubscriptionCard {...base} planLabel="Featured" featured />,
    );
    expect(screen.getByText("Featured")).toBeInTheDocument();
  });

  it("renders an optional card title", () => {
    render(<ManageSubscriptionCard {...base} title="Billing" />);
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("opens the billing portal with the surface's returnTo path", async () => {
    vi.mocked(getCustomerPortalUrl).mockResolvedValue({
      url: "https://portal.example",
    });
    render(<ManageSubscriptionCard {...base} returnTo="/dashboard" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Manage subscription" }),
    );

    await waitFor(() =>
      expect(getCustomerPortalUrl).toHaveBeenCalledWith("/dashboard"),
    );
    expect(redirectToCheckout).toHaveBeenCalledWith({
      url: "https://portal.example",
    });
  });
});

// Phase 3 of #443. Opening a billing portal session is `wait` mode: it cannot be
// aborted once in flight, so a stall never hands the button back.
describe("a billing portal that never opens", () => {
  // Fake timers are scoped to this block. The tests above drive real promises
  // through waitFor and would hang under them.
  const hung: Array<(value: unknown) => void> = [];

  function hang<T>(): Promise<T> {
    return new Promise<T>((resolve) => {
      hung.push(resolve as (value: unknown) => void);
    });
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(async () => {
    // Release the hung action before the next test: React entangles concurrent
    // async actions, so one left in flight stops the next one from settling.
    await act(async () => {
      hung.splice(0).forEach((resolve) => resolve({ error: "cleanup" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.useRealTimers();
  });

  async function clickManage() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /manage|update/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("shows it is opening and blocks a second click", async () => {
    vi.mocked(getCustomerPortalUrl).mockReturnValue(hang());
    render(<ManageSubscriptionCard {...base} />);

    await clickManage();

    expect(screen.getByRole("button")).toBeDisabled();
    expect(getCustomerPortalUrl).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(getCustomerPortalUrl).mockReturnValue(hang());
    render(<ManageSubscriptionCard {...base} />);

    await clickManage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getCustomerPortalUrl).toHaveBeenCalledTimes(1);
  });
});
