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

vi.mock("@/lib/admin/review-actions", () => ({
  adminApproveReview: vi.fn(),
  adminRejectReview: vi.fn(),
  adminResolveRemovalRequest: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  PendingReviewActions,
  RemovalRequestActions,
} from "./ReviewActionButtons";
import { STALL_MS } from "@/components/ui/pending-button";
import {
  adminApproveReview,
  adminRejectReview,
  adminResolveRemovalRequest,
} from "@/lib/admin/review-actions";

// Phase 4 of #443. Moderating a review publishes it or takes it down, and a
// second fire re-runs that. `wait` mode, no retry on a stall.
//
// Both buttons shared one pending flag. That much DID disable the neighbour (a
// shared flag blocks both), so the hole was not a double fire: it was that the
// button the admin never pressed also announced itself as working. Keyed
// in-flight state fixes the label, and the tests below pin the neighbour staying
// dead so a later refactor cannot quietly lose it.

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

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("moderating a pending review", () => {
  it("shows the work on the button that was pressed, not on both", async () => {
    vi.mocked(adminApproveReview).mockReturnValue(hang());
    render(<PendingReviewActions reviewId="r1" />);

    await click(/^approve$/i);

    expect(screen.getByRole("button", { name: /approving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeDisabled();
  });

  it("cannot be rejected while an approve is still in flight", async () => {
    vi.mocked(adminApproveReview).mockReturnValue(hang());
    render(<PendingReviewActions reviewId="r1" />);

    await click(/^approve$/i);
    await click(/^reject$/i);

    expect(adminRejectReview).not.toHaveBeenCalled();
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(adminApproveReview).mockReturnValue(hang());
    render(<PendingReviewActions reviewId="r1" />);

    await click(/^approve$/i);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await click(/approving/i);

    expect(adminApproveReview).toHaveBeenCalledTimes(1);
  });

  it("hands both buttons back when the action really fails", async () => {
    vi.mocked(adminApproveReview).mockResolvedValue({ success: false });
    render(<PendingReviewActions reviewId="r1" />);

    await click(/^approve$/i);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeEnabled();
  });
});

describe("resolving a removal request", () => {
  it("kills the other decision while one is in flight", async () => {
    vi.mocked(adminResolveRemovalRequest).mockReturnValue(hang());
    render(<RemovalRequestActions reviewId="r1" />);

    await click(/honor/i);
    await click(/deny/i);

    // One review, one decision. Honouring and denying at once is nonsense.
    expect(adminResolveRemovalRequest).toHaveBeenCalledTimes(1);
    expect(adminResolveRemovalRequest).toHaveBeenCalledWith({
      review_id: "r1",
      decision: "honor",
    });
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(adminResolveRemovalRequest).mockReturnValue(hang());
    render(<RemovalRequestActions reviewId="r1" />);

    await click(/honor/i);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});
