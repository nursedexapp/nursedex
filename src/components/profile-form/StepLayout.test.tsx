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
import { StepLayout } from "./StepLayout";
import { SLOW_MS, STALL_MS } from "@/components/ui/pending-button";

// Phase 2 of #443. The onboarding wizard's Continue button used to be a plain
// Button that said "Saving..." forever. A step save is an upsert, so a stalled
// one is safe to fire again: this surface gets `retry` mode.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup(props: Partial<React.ComponentProps<typeof StepLayout>> = {}) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  render(
    <StepLayout
      step={1}
      title="Let's start with the basics"
      description="Tell us about yourself."
      onNext={onNext}
      onBack={onBack}
      isSubmitting
      {...props}
    >
      <p>step fields</p>
    </StepLayout>,
  );
  return { onNext, onBack };
}

describe("StepLayout while a step is saving", () => {
  it("disables Continue and says it is saving", () => {
    setup();

    const next = screen.getByRole("button", { name: /saving/i });
    expect(next).toBeDisabled();
  });

  it("reassures the nurse when the save is merely slow", async () => {
    setup();

    await advance(SLOW_MS);

    expect(screen.getByRole("status")).toHaveTextContent(/saving/i);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("hands back a retry when the save stalls, and re-fires the step", async () => {
    const { onNext } = setup();

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /try again/i });
    expect(retry).toBeEnabled();

    await act(async () => {
      fireEvent.click(retry);
    });

    expect(onNext).toHaveBeenCalledTimes(1);
    // The clock restarts, so the nurse sees the work start over rather than
    // firing save after save into a screen that never changes.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("keeps Continue disabled when the step itself is incomplete", async () => {
    // nextDisabled is the caller's own reason. A stall must not hand back a
    // button that would submit a half-filled step.
    setup({ isSubmitting: false, nextDisabled: true });

    await advance(STALL_MS);

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("uses the caller's label when idle", () => {
    setup({ isSubmitting: false, nextLabel: "Complete Profile" });

    expect(
      screen.getByRole("button", { name: "Complete Profile" }),
    ).toBeEnabled();
  });

  it("blocks Back while a save is in flight", () => {
    setup();

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});
