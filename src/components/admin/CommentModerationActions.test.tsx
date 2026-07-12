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
vi.mock("@/lib/comments/actions", () => ({
  approveComment: vi.fn(),
  rejectComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CommentModerationActions } from "./CommentModerationActions";
import { STALL_MS } from "@/components/ui/pending-button";
import {
  approveComment,
  rejectComment,
  deleteComment,
} from "@/lib/comments/actions";
import { BlogCommentStatus } from "@/types/enums";

// Phase 4 of #443. Three icon buttons on one row, driven by a single pending
// flag: the row went dead together and a lone spinner sat beside them, so
// nothing said WHICH action was running. Icons cannot carry the stall panel, so
// this borrows the shared phase clock and renders one alert for the row.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("confirm", () => true);
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

function setup() {
  render(
    <CommentModerationActions id="c1" status={BlogCommentStatus.PENDING} />,
  );
}

describe("moderating a comment", () => {
  it("kills the whole row while one action is in flight", async () => {
    vi.mocked(approveComment).mockReturnValue(hang());
    setup();

    await click(/approve comment/i);

    expect(
      screen.getByRole("button", { name: /approve comment/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /reject comment/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /delete comment/i }),
    ).toBeDisabled();
  });

  it("cannot delete a comment while its approval is still in flight", async () => {
    vi.mocked(approveComment).mockReturnValue(hang());
    setup();

    await click(/approve comment/i);
    await click(/delete comment/i);

    expect(deleteComment).not.toHaveBeenCalled();
  });

  it("says what is stalled and never offers a retry", async () => {
    vi.mocked(approveComment).mockReturnValue(hang());
    setup();

    await click(/approve comment/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await click(/approve comment/i);

    expect(approveComment).toHaveBeenCalledTimes(1);
  });

  it("hands the row back when the action really fails", async () => {
    vi.mocked(rejectComment).mockResolvedValue({ success: false });
    setup();

    await click(/reject comment/i);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reject comment/i }),
    ).toBeEnabled();
  });
});
