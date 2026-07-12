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

const completeFamilyOnboarding = vi.fn();
vi.mock("@/lib/family/actions", () => ({
  completeFamilyOnboarding: (...args: unknown[]) =>
    completeFamilyOnboarding(...args),
}));

import { FamilyOnboardingForm } from "./FamilyOnboardingForm";
import { STALL_MS } from "@/components/ui/pending-button";

// Phase 2 of #443. Saving a family's contact preferences is an upsert, so a
// stalled save is safe to fire again: `retry` mode.
//
// WHO OWNS THE MESSAGE (the question #656 asks). Two different conditions, so
// two different owners, and they cannot appear together:
//
//   the action came back and said no  -> state.formError, inline, below the form
//   the action never came back at all -> the stall alert on the button
//
// The stall alert only exists while the action is pending. The moment the action
// returns, pending flips false and the alert unmounts in the same commit the
// error message renders in. A user never sees both.

beforeEach(() => {
  vi.useFakeTimers();
  completeFamilyOnboarding.mockReset();
});

// Every test here needs an action that hangs, and a hung one has to be released
// before the next test starts. React entangles concurrent async actions through
// state shared across the module, so an action left in flight by one test keeps
// the NEXT test's action from ever settling: isPending stays true forever and
// the stall message never clears. That is a test-isolation trap, not app
// behaviour (each of these passes alone), but it is a silent one, so hang() is
// the only way this file is allowed to hang a promise.
const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({}));
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

function setup() {
  const { container } = render(
    <FamilyOnboardingForm
      defaultEmail="family@example.com"
      defaultZip="11779"
      defaultPhone=""
      defaultCommPref="email"
    />,
  );
  const form = container.querySelector("form")!;
  // Submit the form directly rather than clicking. Native constraint validation
  // is not what is under test here.
  return {
    submit: async () => {
      await act(async () => {
        fireEvent.submit(form);
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

describe("FamilyOnboardingForm submit button", () => {
  it("shows the save is running and blocks a second submit", async () => {
    completeFamilyOnboarding.mockReturnValue(hang());
    const { submit } = setup();

    await submit();

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("hands back a retry when the save stalls", async () => {
    completeFamilyOnboarding.mockReturnValue(hang());
    const { submit } = setup();

    await submit();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("lets the inline error own a real failure, with no stall message left over", async () => {
    // The failure that arrives late: the action stalls first, THEN comes back
    // with an error. The stall message has to get out of the way, or the family
    // is told two contradictory things about the same save.
    let settle: (value: { formError: string }) => void = () => {};
    completeFamilyOnboarding.mockReturnValue(
      new Promise<{ formError: string }>((resolve) => {
        settle = resolve;
      }),
    );
    const { submit } = setup();

    await submit();
    await advance(STALL_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await act(async () => {
      settle({ formError: "Something went wrong. Please try again." });
      await vi.advanceTimersByTimeAsync(0);
    });
    // useActionState has to settle the action and end its transition before
    // isPending drops and the phase effect re-runs. That is a scheduler tick,
    // not a delay anyone sees.
    await advance(20);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
