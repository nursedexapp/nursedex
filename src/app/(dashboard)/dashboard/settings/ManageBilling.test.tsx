// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/subscriptions/actions", () => ({
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { ManageBilling } from "./ManageBilling";

afterEach(cleanup);

const RENEWS_ON = "2026-07-13T12:00:00Z";

describe("ManageBilling", () => {
  it("shows the renewal date and a manage button for an active sub", () => {
    render(
      <ManageBilling
        planLabel="Family Access"
        renewsOn={RENEWS_ON}
        cancelAtPeriodEnd={false}
        isPastDue={false}
      />,
    );
    expect(screen.getByText(/Family Access renews on/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage subscription" }),
    ).toBeInTheDocument();
  });

  it("softens the copy to an end date when cancellation is scheduled", () => {
    render(
      <ManageBilling
        planLabel="Featured"
        renewsOn={RENEWS_ON}
        cancelAtPeriodEnd={true}
        isPastDue={false}
      />,
    );
    expect(
      screen.getByText(/Featured cancellation scheduled\. Access ends on/),
    ).toBeInTheDocument();
    // "renews" copy must not show once a cancellation is pending.
    expect(screen.queryByText(/renews on/)).not.toBeInTheDocument();
  });

  it("steers a past-due sub toward updating payment", () => {
    render(
      <ManageBilling
        planLabel="Family Access"
        renewsOn={RENEWS_ON}
        cancelAtPeriodEnd={false}
        isPastDue={true}
      />,
    );
    expect(
      screen.getByText(/Update payment to keep Family Access/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update payment" }),
    ).toBeInTheDocument();
  });
});
