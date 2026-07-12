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

vi.mock("@/lib/reviews/actions", () => ({ requestReviewRemoval: vi.fn() }));
vi.mock("@/lib/reviews/nurse-actions", () => ({
  disputeReview: vi.fn(),
  saveNurseResponse: vi.fn(),
  deleteNurseResponse: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DisputeReviewDialog } from "./DisputeReviewDialog";
import { RemovalRequestDialog } from "./RemovalRequestDialog";
import { NurseResponseForm } from "./NurseResponseForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { requestReviewRemoval } from "@/lib/reviews/actions";
import {
  disputeReview,
  saveNurseResponse,
  deleteNurseResponse,
} from "@/lib/reviews/nurse-actions";

// Phase 5 of #443. Disputes and removal requests each raise a case and notify,
// so a second fire is a second case. The nurse's public response is a save, but
// it is still `wait`: see #669 for why the whole sweep holds off on retry.

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
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function stall() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STALL_MS);
  });
}

async function openAndSubmit(trigger: RegExp, fill?: () => void) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: trigger }));
  });
  if (fill) await act(async () => fill());
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("disputing a review", () => {
  it("stays disabled on a stall and never raises a second dispute", async () => {
    vi.mocked(disputeReview).mockReturnValue(hang());
    render(<DisputeReviewDialog reviewId="r1" />);

    await openAndSubmit(/dispute/i, () => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Not a real client" },
      });
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "This never happened, I never worked with them." },
      });
    });
    await stall();

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(disputeReview).toHaveBeenCalledTimes(1);
  });
});

describe("requesting a review's removal", () => {
  it("stays disabled on a stall and never raises a second request", async () => {
    vi.mocked(requestReviewRemoval).mockReturnValue(hang());
    render(
      <RemovalRequestDialog reviewId="r1" triggerLabel="Request removal" />,
    );

    await openAndSubmit(/request removal/i, () => {
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "This review names my patient by name." },
      });
    });
    await stall();

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(requestReviewRemoval).toHaveBeenCalledTimes(1);
  });
});

describe("a nurse's response to a review", () => {
  it("shows the work on Save, not on the Delete beside it", async () => {
    vi.mocked(saveNurseResponse).mockReturnValue(hang());
    render(
      <NurseResponseForm reviewId="r1" existingResponse="An older response" />,
    );

    await openAndSubmit(/edit response/i);

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
    expect(deleteNurseResponse).not.toHaveBeenCalled();
  });

  it("cannot delete the response while its save is still in flight", async () => {
    vi.mocked(saveNurseResponse).mockReturnValue(hang());
    render(
      <NurseResponseForm reviewId="r1" existingResponse="An older response" />,
    );

    await openAndSubmit(/edit response/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(deleteNurseResponse).not.toHaveBeenCalled();
  });
});
