// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => {
  const state = { search: "" };
  return { state, refresh: vi.fn() };
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
vi.mock("@/lib/posthog", () => ({ posthog: { __loaded: false, capture: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RevealCTA } from "./RevealCTA";

beforeEach(() => {
  h.state.search = "";
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("RevealCTA no_sub mode", () => {
  it("shows the paywall trigger when there is no provisioning marker", () => {
    render(
      <RevealCTA nurseUserId="n1" nurseFirstName="Sam" returnTo="/nurses/sam" mode="no_sub" />,
    );

    expect(
      screen.getByRole("button", { name: /Reveal contact info/ }),
    ).toBeInTheDocument();
  });

  it("shows a provisioning notice instead of the paywall right after checkout (#426)", () => {
    h.state.search = "provisioning=pending";
    render(
      <RevealCTA nurseUserId="n1" nurseFirstName="Sam" returnTo="/nurses/sam" mode="no_sub" />,
    );

    expect(screen.getByText(/Finishing your subscription/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reveal contact info/ }),
    ).not.toBeInTheDocument();
  });
});
