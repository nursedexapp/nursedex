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

vi.mock("@/lib/reviews/external-actions", () => ({
  submitExternalReview: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ExternalReviewForm } from "./ExternalReviewForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { submitExternalReview } from "@/lib/reviews/external-actions";

// Phase 3 of #443. An external review writes a row and sends a confirmation
// email, so a second fire is a duplicate review and a second email: `wait` mode.

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

async function rateAndSubmit() {
  render(<ExternalReviewForm linkToken="tok" nurseFirstName="Sam" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: /5 star/i }));
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("submitting an external review", () => {
  it("blocks a second submit while the first is running", async () => {
    vi.mocked(submitExternalReview).mockReturnValue(hang());
    await rateAndSubmit();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(submitExternalReview).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(submitExternalReview).mockReturnValue(hang());
    await rateAndSubmit();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitExternalReview).toHaveBeenCalledTimes(1);
  });

  it("hands the button back when the review really fails", async () => {
    vi.mocked(submitExternalReview).mockResolvedValue({
      success: false,
      error: "link_invalid",
    });
    await rateAndSubmit();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeEnabled();
  });
});
