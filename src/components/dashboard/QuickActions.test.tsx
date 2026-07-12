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

vi.mock("@/lib/profile/actions", () => ({ toggleAvailability: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { QuickActions } from "./QuickActions";
import { STALL_MS, SLOW_MS } from "@/components/ui/pending-button";
import { toggleAvailability } from "@/lib/profile/actions";

// Phase 5 of #443. This button carries an icon and a right-aligned hint, so it
// keeps its own markup and borrows the shared clock instead of taking
// PendingButton's layout. Same three states either way.

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
    hung.splice(0).forEach((resolve) => resolve({ error: "cleanup" }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function toggle() {
  render(<QuickActions isAvailable />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("toggling availability", () => {
  it("shows the save is running and blocks a second click", async () => {
    vi.mocked(toggleAvailability).mockReturnValue(hang());
    await toggle();

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(toggleAvailability).toHaveBeenCalledTimes(1);
  });

  it("says it is still working when the save is merely slow", async () => {
    vi.mocked(toggleAvailability).mockReturnValue(hang());
    await toggle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_MS);
    });

    expect(screen.getByRole("status")).toHaveTextContent(/still saving/i);
  });

  it("stays disabled on a stall and never toggles twice", async () => {
    vi.mocked(toggleAvailability).mockReturnValue(hang());
    await toggle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /saving/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toggleAvailability).toHaveBeenCalledTimes(1);
  });

  it("hands the button back when the toggle really fails", async () => {
    vi.mocked(toggleAvailability).mockResolvedValue({ error: "nope" });
    await toggle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
