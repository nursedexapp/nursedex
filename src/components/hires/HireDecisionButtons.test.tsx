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

vi.mock("@/lib/hires/actions", () => ({
  confirmHireFromToken: vi.fn(),
  rejectHireFromToken: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HireDecisionButtons } from "./HireDecisionButtons";
import { STALL_MS } from "@/components/ui/pending-button";
import { confirmHireFromToken, rejectHireFromToken } from "@/lib/hires/actions";

// Phase 3 of #443. Confirming a hire writes a hire row and sends email (#651), so
// it is `wait` mode. Two buttons sharing one decision: whichever is in flight
// must show the work, and the OTHER one has to go dead too. A family that clicks
// "No, I didn't" while "Yes" is still processing gets two conflicting decisions
// against the same token.

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

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("confirming a hire", () => {
  it("shows the work on the button that was pressed, not on both", async () => {
    vi.mocked(confirmHireFromToken).mockReturnValue(hang());
    render(<HireDecisionButtons token="t1" />);

    await click(/yes, i hired them/i);

    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled();
    // The reject button keeps its own label. It just cannot be pressed.
    expect(screen.getByRole("button", { name: /no, i didn/i })).toBeDisabled();
  });

  it("cannot be answered twice while a decision is in flight", async () => {
    vi.mocked(confirmHireFromToken).mockReturnValue(hang());
    render(<HireDecisionButtons token="t1" />);

    await click(/yes, i hired them/i);
    await click(/no, i didn/i);

    expect(rejectHireFromToken).not.toHaveBeenCalled();
    expect(confirmHireFromToken).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    vi.mocked(confirmHireFromToken).mockReturnValue(hang());
    render(<HireDecisionButtons token="t1" />);

    await click(/yes, i hired them/i);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /no, i didn/i })).toBeDisabled();
  });

  it("lets the toast own a failure and hands both buttons back", async () => {
    vi.mocked(confirmHireFromToken).mockResolvedValue({
      success: false,
      error: "not_found",
    });
    render(<HireDecisionButtons token="t1" />);

    await click(/yes, i hired them/i);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /yes, i hired them/i }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: /no, i didn/i })).toBeEnabled();
  });

  it("thanks the family once the decision lands", async () => {
    vi.mocked(rejectHireFromToken).mockResolvedValue({ success: true });
    render(<HireDecisionButtons token="t1" />);

    await click(/no, i didn/i);

    expect(screen.getByText(/we won't record this hire/i)).toBeInTheDocument();
  });
});
