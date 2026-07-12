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
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { PastDueBanner } from "./PastDueBanner";
import { STALL_MS } from "@/components/ui/pending-button";
import { getCustomerPortalUrl } from "@/lib/subscriptions/actions";
import { toast } from "sonner";

// Phase 3 of #443. Opening the Stripe billing portal is `wait` mode: the request
// cannot be aborted, so a stall never hands the button back for a second session.

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

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

async function clickUpdate() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /update payment/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("PastDueBanner", () => {
  it("blocks a second click while the portal is opening", async () => {
    vi.mocked(getCustomerPortalUrl).mockReturnValue(hang());
    render(<PastDueBanner planType="family_access" />);

    await clickUpdate();

    expect(screen.getByRole("button")).toBeDisabled();
    expect(getCustomerPortalUrl).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(getCustomerPortalUrl).mockReturnValue(hang());
    render(<PastDueBanner planType="family_access" />);

    await clickUpdate();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("lets the toast own a failure and hands the button back", async () => {
    // A real answer, even a bad one, is not a stall: the user can act again.
    vi.mocked(getCustomerPortalUrl).mockResolvedValue({ error: "No customer" });
    render(<PastDueBanner planType="nurse_featured" />);

    await clickUpdate();

    expect(toast.error).toHaveBeenCalledWith("No customer");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
