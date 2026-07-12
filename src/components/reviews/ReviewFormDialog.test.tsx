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

vi.mock("@/lib/reviews/actions", () => ({
  submitFamilyReview: vi.fn(),
  updateFamilyReview: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ReviewFormDialog } from "./ReviewFormDialog";
import { STALL_MS } from "@/components/ui/pending-button";
import { submitFamilyReview } from "@/lib/reviews/actions";
import { toast } from "sonner";

// Phase 3 of #443. Submitting a review writes a review row, so a second fire is a
// duplicate: `wait` mode, no retry on a stall.

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

// Open the dialog, pick a rating (the form refuses to submit without one), and
// submit.
async function openRateAndSubmit() {
  render(
    <ReviewFormDialog
      nurseUserId="n1"
      nurseFirstName="Sam"
      defaultFirstName="Dana"
      triggerLabel="Leave a review"
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Leave a review" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: /5 star/i }));
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("submitting a review", () => {
  it("blocks a second submit while the first is running", async () => {
    vi.mocked(submitFamilyReview).mockReturnValue(hang());
    await openRateAndSubmit();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(submitFamilyReview).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(submitFamilyReview).mockReturnValue(hang());
    await openRateAndSubmit();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitFamilyReview).toHaveBeenCalledTimes(1);
  });

  it("lets the toast own a failure and hands the button back", async () => {
    vi.mocked(submitFamilyReview).mockResolvedValue({
      success: false,
      error: "already_reviewed",
    });
    await openRateAndSubmit();

    expect(toast.error).toHaveBeenCalledWith(
      "You already left a review for this nurse",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeEnabled();
  });
});
