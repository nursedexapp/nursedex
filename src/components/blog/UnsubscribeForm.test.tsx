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

vi.mock("@/lib/newsletter/actions", () => ({ unsubscribeByEmail: vi.fn() }));

import { UnsubscribeForm } from "./UnsubscribeForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { unsubscribeByEmail } from "@/lib/newsletter/actions";

// #669 phase 5. This was `wait`, so someone whose unsubscribe hung was told to
// refresh a page they were trying to leave. Unsubscribing is idempotent: the
// action stamps unsubscribed_at on a row matched by email, and doing that twice
// leaves them exactly as unsubscribed as doing it once. There was nothing to
// protect, and being cautious cost them the one thing they came to do.

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

async function submit() {
  render(<UnsubscribeForm />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "leaving@example.com" },
    });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("unsubscribing", () => {
  it("blocks a second submit while the first is running", async () => {
    vi.mocked(unsubscribeByEmail).mockReturnValue(hang());
    await submit();

    expect(
      screen.getByRole("button", { name: /unsubscribing/i }),
    ).toBeDisabled();
    expect(unsubscribeByEmail).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a stall rather than telling them to refresh", async () => {
    vi.mocked(unsubscribeByEmail).mockReturnValue(hang());
    await submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await act(async () => {
      fireEvent.click(again);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(unsubscribeByEmail).toHaveBeenCalledTimes(2);
  });

  it("does not let the superseded request undo the retry's success", async () => {
    // The hung first request is still out there. If it lands after the retry has
    // already confirmed, it must not drag the form back to the error state.
    let releaseFirst!: (v: unknown) => void;
    vi.mocked(unsubscribeByEmail)
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseFirst = r as (v: unknown) => void;
        }),
      )
      .mockResolvedValueOnce({ success: true });

    await submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/has been unsubscribed/i)).toBeInTheDocument();

    await act(async () => {
      releaseFirst({ success: false });
      await vi.advanceTimersByTimeAsync(20);
    });

    // Still confirmed. The stale failure said nothing.
    expect(screen.getByText(/has been unsubscribed/i)).toBeInTheDocument();
    expect(screen.queryByText(/valid email/i)).toBeNull();
  });

  it("shows a real failure", async () => {
    vi.mocked(unsubscribeByEmail).mockResolvedValue({ success: false });
    await submit();

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });
});
