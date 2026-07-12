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

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ resetPostHog: vi.fn() }));

import { DashboardSidebar } from "./DashboardSidebar";
import { STALL_MS } from "@/components/ui/pending-button";
import { signOut } from "@/lib/auth/actions";

// Phase 5 of #443. Sign out had NO pending state at all: a hung sign-out looked
// exactly like a button nobody had pressed. It keeps its nav-item styling and
// borrows the shared clock.

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

async function clickSignOut(name: RegExp = /^sign out$/i) {
  render(<DashboardSidebar role="nurse" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("signing out", () => {
  it("shows the sign-out is running instead of looking like a dead click", async () => {
    vi.mocked(signOut).mockReturnValue(hang());
    await clickSignOut();

    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("says so when the sign-out stalls, and never fires it twice", async () => {
    vi.mocked(signOut).mockReturnValue(hang());
    await clickSignOut();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /signing out/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
