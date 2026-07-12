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

vi.mock("@/lib/hires/actions", () => ({ claimHireByEmail: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { NurseClaimHireCard } from "./NurseClaimHireCard";
import { STALL_MS } from "@/components/ui/pending-button";
import { claimHireByEmail } from "@/lib/hires/actions";

// Phase 5 of #443. Claiming a hire emails the family a confirmation request, so
// a second fire is a second email to a real person: `wait` mode.

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

async function claim() {
  render(<NurseClaimHireCard slug="sam-r" />);
  await act(async () => {
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "family@example.com" },
    });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("claiming a hire", () => {
  it("blocks a second claim while the first is running", async () => {
    vi.mocked(claimHireByEmail).mockReturnValue(hang());
    await claim();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(claimHireByEmail).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never emails the family twice", async () => {
    vi.mocked(claimHireByEmail).mockReturnValue(hang());
    await claim();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(claimHireByEmail).toHaveBeenCalledTimes(1);
  });
});
