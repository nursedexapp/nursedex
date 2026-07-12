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
  adminResolveDispute: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DisputeDecisionDialog } from "./DisputeDecisionDialog";
import { STALL_MS } from "@/components/ui/pending-button";
import { adminResolveDispute } from "@/lib/admin/review-actions";

// Phase 4 of #443. Resolving a dispute notifies BOTH parties by email, so a
// second fire is two more emails to real people: `wait` mode.

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

async function openAndSubmit() {
  render(
    <DisputeDecisionDialog
      reviewId="r1"
      decision="remove"
      triggerLabel="Remove review"
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /remove review/i }));
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("resolving a dispute", () => {
  it("blocks a second submit while the first is running", async () => {
    vi.mocked(adminResolveDispute).mockReturnValue(hang());
    await openAndSubmit();

    expect(adminResolveDispute).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never emails both parties twice", async () => {
    vi.mocked(adminResolveDispute).mockReturnValue(hang());
    await openAndSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(adminResolveDispute).toHaveBeenCalledTimes(1);
  });
});
