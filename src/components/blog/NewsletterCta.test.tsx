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

vi.mock("@/lib/newsletter/actions", () => ({
  subscribeNewsletter: vi.fn(),
  unsubscribeByEmail: vi.fn(),
}));

import { NewsletterCta } from "./NewsletterCta";
import { UnsubscribeForm } from "./UnsubscribeForm";
import { STALL_MS } from "@/components/ui/pending-button";
import {
  subscribeNewsletter,
  unsubscribeByEmail,
} from "@/lib/newsletter/actions";

// Phase 5 of #443. Both `wait`. Subscribing sends a confirmation email, so a
// second fire is a second email. Unsubscribing is safe to repeat and would be a
// fair candidate for `retry`, but a retry does not cancel the first request: the
// hung one can still land and contradict it, the newest-attempt hole PhotoUpload
// had to close (#667). Graduating this sweep to retry needs that guard (#669).

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

async function submit(email: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: email },
    });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("subscribing", () => {
  it("stays disabled on a stall and never sends a second confirmation email", async () => {
    vi.mocked(subscribeNewsletter).mockReturnValue(hang());
    render(<NewsletterCta source="blog" />);

    await submit("dana@example.com");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(subscribeNewsletter).toHaveBeenCalledTimes(1);
  });
});

describe("unsubscribing", () => {
  it("stays disabled on a stall and never fires a second unsubscribe", async () => {
    vi.mocked(unsubscribeByEmail).mockReturnValue(hang());
    render(<UnsubscribeForm />);

    await submit("dana@example.com");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(unsubscribeByEmail).toHaveBeenCalledTimes(1);
  });
});
