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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/hires/actions", () => ({ recordFamilyHire: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HireButton } from "./HireButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { recordFamilyHire } from "@/lib/hires/actions";
import { toast } from "sonner";

// Phase 3 of #443 put this in `wait` mode: a second fire wrote a second hire row
// and sent a second pair of emails (#651).
//
// #669 graduates it to `retry`. Migration 058's UNIQUE (family_user_id,
// nurse_user_id) closed the double write, so a repeat cannot record a second
// hire. The remaining half of the problem was in the REPORTING: a repeat comes
// back `already_recorded`, and this component used to render that as a red error
// toast. A retry over a hung-but-successful hire would therefore have told the
// family it failed when it had worked. It now says the hire is already recorded,
// which is the truth in both cases.

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

async function openAndConfirm() {
  render(<HireButton nurseUserId="n1" nurseFirstName="Sam" hire={null} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /i hired sam/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /yes, i hired sam/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("recording a hire", () => {
  it("blocks a second confirm while the first is running", async () => {
    // A retry is a deliberate act on a STALLED button. Until then, the gate holds.
    vi.mocked(recordFamilyHire).mockReturnValue(hang());
    await openAndConfirm();

    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled();
    expect(recordFamilyHire).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a stall, and fires it", async () => {
    vi.mocked(recordFamilyHire).mockReturnValue(hang());
    await openAndConfirm();
    await advance(STALL_MS);

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await act(async () => {
      fireEvent.click(again);
      await vi.advanceTimersByTimeAsync(0);
    });

    // Safe to fire twice now: the database refuses the second row.
    expect(recordFamilyHire).toHaveBeenCalledTimes(2);
  });

  it("does not let the superseded request report over the retry", async () => {
    // The hung first request is still out there. When it lands it must stay
    // quiet, or it toasts a failure over a hire the retry actually recorded.
    let releaseFirst!: (v: unknown) => void;
    vi.mocked(recordFamilyHire)
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseFirst = r as (v: unknown) => void;
        }),
      )
      .mockResolvedValueOnce({ success: true });

    await openAndConfirm();
    await advance(STALL_MS);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toast.success).toHaveBeenCalledWith("Recorded hire of Sam");
    vi.mocked(toast.error).mockClear();

    await act(async () => {
      releaseFirst({ success: false, error: "unknown" });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports an already-recorded hire as done, not as a failure", async () => {
    // The reason this could not graduate before. A retry over a hung-but-
    // successful hire comes back `already_recorded` from the unique constraint.
    // The hire EXISTS: that is what the family asked for, so saying it failed is
    // a lie.
    vi.mocked(recordFamilyHire).mockResolvedValue({
      success: false,
      error: "already_recorded",
    });
    await openAndConfirm();

    expect(toast.success).toHaveBeenCalledWith(
      "Sam is already recorded as hired",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still shouts about a real failure", async () => {
    vi.mocked(recordFamilyHire).mockResolvedValue({
      success: false,
      error: "unknown",
    });
    await openAndConfirm();

    expect(toast.error).toHaveBeenCalledWith(
      "Could not record the hire. Please try again.",
    );
    expect(
      screen.getByRole("button", { name: /yes, i hired sam/i }),
    ).toBeEnabled();
  });
});
