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
import { useEffect } from "react";

vi.mock("@/lib/contact/actions", () => ({ submitContact: vi.fn() }));
// The form refuses to submit without a CAPTCHA token. Solve it immediately: the
// CAPTCHA is not what is under test.
vi.mock("@/components/reveals/TurnstileWidget", () => ({
  TurnstileWidget: ({ onSolved }: { onSolved: (t: string) => void }) => {
    useEffect(() => onSolved("test-token"), [onSolved]);
    return null;
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ContactForm } from "./ContactForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { submitContact } from "@/lib/contact/actions";

// Phase 5 of #443. Sending a contact message emails us, so a second fire is a
// second message: `wait` mode.

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

async function fillAndSend() {
  render(<ContactForm />);
  const set = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  await act(async () => {
    set(/name/i, "Dana");
    set(/email/i, "dana@example.com");
    set(/subject/i, "Question");
    set(/message/i, "How does verification work?");
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("sending a contact message", () => {
  it("blocks a second send while the first is running", async () => {
    vi.mocked(submitContact).mockReturnValue(hang());
    await fillAndSend();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(submitContact).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never sends a second message", async () => {
    vi.mocked(submitContact).mockReturnValue(hang());
    await fillAndSend();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitContact).toHaveBeenCalledTimes(1);
  });
});
