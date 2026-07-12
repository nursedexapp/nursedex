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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("email=nurse%40example.com"),
}));
vi.mock("@/lib/auth/actions", () => ({ resendConfirmation: vi.fn() }));

import ConfirmPage from "./page";
import { STALL_MS } from "@/components/ui/pending-button";
import { resendConfirmation } from "@/lib/auth/actions";

// #659. Resending a confirmation email sends a real nurse a real email, so a
// second fire is a second email: `wait` mode.
//
// Phase 1 of #443 converted the auth screens and missed this button entirely.
// The lint rule is what found it, which is the argument for having the rule.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({}));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

// The button opens in a 60 second cooldown, so a nurse cannot mash it the moment
// the page loads. Tick past it before pressing anything.
async function waitOutCooldown() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61_000);
  });
}

async function resend(name: RegExp = /resend confirmation email/i) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("resending the confirmation email", () => {
  it("blocks a second resend while the first is running", async () => {
    vi.mocked(resendConfirmation).mockReturnValue(hang());
    render(<ConfirmPage />);
    await waitOutCooldown();

    await resend();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(resendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never emails the nurse twice", async () => {
    vi.mocked(resendConfirmation).mockReturnValue(hang());
    render(<ConfirmPage />);
    await waitOutCooldown();

    await resend();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/check your inbox/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await resend(/sending/i);

    expect(resendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("hands the button back when the resend really fails", async () => {
    vi.mocked(resendConfirmation).mockResolvedValue({ error: "Rate limited" });
    render(<ConfirmPage />);
    await waitOutCooldown();

    await resend();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Rate limited")).toBeInTheDocument();
  });
});
