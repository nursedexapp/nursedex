// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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
      <ManageSubscriptionCard {...base} planLabel="Featured" cancelAtPeriodEnd />,
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
