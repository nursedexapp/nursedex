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

vi.mock("@/lib/comments/actions", () => ({ submitComment: vi.fn() }));

import { CommentForm } from "./CommentForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { submitComment } from "@/lib/comments/actions";

// Phase 5 of #443. Posting a comment writes a row, so a second fire is a second
// comment: `wait` mode.

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

async function post() {
  render(<CommentForm postId="p1" />);
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("posting a comment", () => {
  it("blocks a second post while the first is running", async () => {
    vi.mocked(submitComment).mockReturnValue(hang());
    await post();

    expect(screen.getByRole("button", { name: /posting/i })).toBeDisabled();
    expect(submitComment).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never posts the comment twice", async () => {
    vi.mocked(submitComment).mockReturnValue(hang());
    await post();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitComment).toHaveBeenCalledTimes(1);
  });
});
