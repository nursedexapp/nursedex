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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("@/lib/nurses/saves-actions", () => ({ toggleSavedNurse: vi.fn() }));
vi.mock("@/lib/posthog", () => ({
  posthog: { __loaded: false, capture: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SaveHeartButton } from "./SaveHeartButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { toggleSavedNurse } from "@/lib/nurses/saves-actions";
import { toast } from "sonner";

// Phase 3 of #443. The heart is a toggle, and toggleSavedNurse reads the current
// row and flips it. Firing it twice therefore lands the family back where they
// started, which is worse than a duplicate: it silently undoes what they asked
// for. So it is `wait` mode, and the button never comes back on a stall.
//
// It is also an icon in the corner of a card and cannot carry a stall panel. On a
// stall the optimistic heart is rolled back and a toast says we could not confirm
// it, so the family is not left looking at a fill that may be a lie.

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
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
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

function setup(initialIsSaved = false) {
  render(<SaveHeartButton nurseUserId="n1" initialIsSaved={initialIsSaved} />);
  return {
    heart: () => screen.getByRole("button"),
    click: async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button"));
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

describe("saving a nurse", () => {
  it("fills the heart straight away and blocks a second click", async () => {
    vi.mocked(toggleSavedNurse).mockReturnValue(hang());
    const { heart, click } = setup();

    await click();

    expect(heart()).toHaveAttribute("aria-pressed", "true");
    expect(heart()).toBeDisabled();
    expect(toggleSavedNurse).toHaveBeenCalledTimes(1);
  });

  it("rolls the heart back on a stall and says we could not confirm it", async () => {
    vi.mocked(toggleSavedNurse).mockReturnValue(hang());
    const { heart, click } = setup();

    await click();
    await advance(STALL_MS);

    expect(heart()).toHaveAttribute("aria-pressed", "false");
    expect(toast.error).toHaveBeenCalledWith(
      "We couldn't confirm that. Refresh to check your saved list.",
    );
  });

  it("never lets a stalled toggle be fired again", async () => {
    // The second fire is the dangerous one: toggleSavedNurse reads the row and
    // flips it, so a save followed by a retry is an UNSAVE.
    vi.mocked(toggleSavedNurse).mockReturnValue(hang());
    const { heart, click } = setup();

    await click();
    await advance(STALL_MS);
    await click();

    expect(heart()).toBeDisabled();
    expect(toggleSavedNurse).toHaveBeenCalledTimes(1);
  });

  it("rolls back and hands the heart back when the toggle really fails", async () => {
    vi.mocked(toggleSavedNurse).mockResolvedValue({
      success: false,
      isSaved: false,
      error: "not_authenticated",
    });
    const { heart, click } = setup();

    await click();

    expect(heart()).toHaveAttribute("aria-pressed", "false");
    expect(heart()).toBeEnabled();
    expect(toast.error).toHaveBeenCalledWith("Log in to save nurses");
  });

  it("keeps the fill when the save lands", async () => {
    vi.mocked(toggleSavedNurse).mockResolvedValue({
      success: true,
      isSaved: true,
    });
    const { heart, click } = setup();

    await click();

    expect(heart()).toHaveAttribute("aria-pressed", "true");
    expect(heart()).toBeEnabled();
    expect(toast.success).toHaveBeenCalledWith("Saved to your list");
  });
});

// #776. In a grid constrained to saved nurses, unsaving changes which cards
// belong there. Local state alone leaves the card sitting in a grid that
// claims to show only saves.
describe("unsaving inside a saved only view", () => {
  it("refreshes the route so the card leaves the grid", async () => {
    vi.mocked(toggleSavedNurse).mockResolvedValue({
      success: true,
      isSaved: false,
    });
    render(<SaveHeartButton nurseUserId="n1" initialIsSaved inSavedOnlyView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("does not refresh on an ordinary grid", async () => {
    vi.mocked(toggleSavedNurse).mockResolvedValue({
      success: true,
      isSaved: false,
    });
    render(<SaveHeartButton nurseUserId="n1" initialIsSaved />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the action failed", async () => {
    vi.mocked(toggleSavedNurse).mockResolvedValue({
      success: false,
      isSaved: true,
      error: "unknown",
    });
    render(<SaveHeartButton nurseUserId="n1" initialIsSaved inSavedOnlyView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
