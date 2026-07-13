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

vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ resetPostHog: vi.fn() }));

import { SignOutButton } from "./SignOutButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { signOut } from "@/lib/auth/actions";

// #659. There were FOUR sign-out buttons (nurse sidebar, admin sidebar, mobile
// nav, settings page) and not one of them tracked pending state: each was a bare
// <form action={signOut}>, so a hung sign-out looked exactly like a button nobody
// had pressed. Nothing on screen moved at all.
//
// The lint rule found the other three after the first was fixed by hand, which is
// the whole argument for the rule. They are one component now.

const hung: Array<() => void> = [];

function hang() {
  return new Promise<void>((resolve) => hung.push(resolve));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((r) => r());
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("signing out", () => {
  it("shows the sign-out is running instead of looking like a dead click", async () => {
    vi.mocked(signOut).mockReturnValue(hang());
    render(<SignOutButton />);

    await click(/^sign out$/i);

    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a stall, because signing out twice is harmless", async () => {
    // #669 phase 5. This was `wait`, so a stalled sign-out told the user to
    // refresh. Signing out is idempotent: the second call ends the same session
    // the first one was ending. There was never anything to protect here.
    vi.mocked(signOut).mockReturnValue(hang());
    render(<SignOutButton />);

    await click(/^sign out$/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await act(async () => {
      fireEvent.click(again);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("closes the drawer it was opened from", async () => {
    vi.mocked(signOut).mockReturnValue(hang());
    const onNavigate = vi.fn();
    render(<SignOutButton onNavigate={onNavigate} />);

    await click(/^sign out$/i);

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("works the same as a standalone button", async () => {
    vi.mocked(signOut).mockReturnValue(hang());
    render(<SignOutButton variant="button" />);

    await click(/^sign out$/i);

    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
  });
});
