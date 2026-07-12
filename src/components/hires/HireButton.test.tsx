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

vi.mock("@/lib/hires/actions", () => ({ recordFamilyHire: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HireButton } from "./HireButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { recordFamilyHire } from "@/lib/hires/actions";
import { toast } from "sonner";

// Phase 3 of #443. Recording a hire writes a hire row and sends emails (#651), so
// a second fire is a second hire, not a harmless repeat: `wait` mode.

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
    vi.mocked(recordFamilyHire).mockReturnValue(hang());
    await openAndConfirm();

    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled();
    expect(recordFamilyHire).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(recordFamilyHire).mockReturnValue(hang());
    await openAndConfirm();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /recording/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    // A second hire row and a second pair of emails is exactly what #651 was.
    expect(recordFamilyHire).toHaveBeenCalledTimes(1);
  });

  it("lets the toast own a failure and hands the button back", async () => {
    vi.mocked(recordFamilyHire).mockResolvedValue({
      success: false,
      error: "already_recorded",
    });
    await openAndConfirm();

    expect(toast.error).toHaveBeenCalledWith(
      "You've already recorded a hire with this nurse.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /yes, i hired sam/i }),
    ).toBeEnabled();
  });
});
