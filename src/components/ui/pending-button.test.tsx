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
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { PendingButton, SLOW_MS, STALL_MS } from "./pending-button";

// #654 (phase 0 of #443). Every async button in the app hand-rolls its pending
// state, so a hung action looks exactly like a working one: the same spinner,
// forever, with nothing to click. This is the one primitive they all adopt.
//
// Two of these tests exist because the red-team broke the first design:
//
// 1. A retry has to restart the clock. A hung request never stops being
//    pending, so a phase derived from `pending` alone never re-runs: the user
//    clicks "Try again", another request goes out, and the screen does not
//    change. The retry button would be a dead control, reintroducing the very
//    bug this component exists to kill.
//
// 2. "wait" mode must stay DISABLED. Re-enabling on a stall hands the user a
//    live button on a surface where firing twice duplicates a side effect (a
//    second reveal burns a capped daily slot, a second admin approve re-sends a
//    nurse her verification email). Refusing to auto-refire is not enough if the
//    button underneath is still clickable.

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

function setup(
  props: Partial<React.ComponentProps<typeof PendingButton>> = {},
) {
  const onRetry = vi.fn();
  render(
    <PendingButton
      pending
      mode="retry"
      idleLabel="Save changes"
      workingLabel="Saving..."
      slowLabel="Still saving..."
      onRetry={onRetry}
      {...props}
    />,
  );
  return { onRetry };
}

describe("PendingButton phases", () => {
  it("shows the working label and disables the button while the action runs", () => {
    setup();

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Saving...");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("escalates to a still-working message a moment in, and announces it politely", async () => {
    setup();

    await advance(SLOW_MS);

    // role=status, not role=alert: this is reassurance, not a problem, and it
    // must not interrupt a screen reader mid-sentence.
    expect(screen.getByRole("status")).toHaveTextContent("Still saving...");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("turns a hang into an actionable retry once it is clearly stalled", async () => {
    setup();

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).toHaveTextContent(/try again/i);
  });

  it("goes back to idle when the action finishes", () => {
    const { rerender } = render(
      <PendingButton
        pending
        mode="retry"
        idleLabel="Save changes"
        workingLabel="Saving..."
      />,
    );

    rerender(
      <PendingButton
        pending={false}
        mode="retry"
        idleLabel="Save changes"
        workingLabel="Saving..."
      />,
    );

    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).toHaveTextContent("Save changes");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("a caller's own disabled reason still wins", () => {
  it("stays disabled when the caller says so, even once it has stalled", async () => {
    // Role select disables Continue until a role is picked. A stall must not
    // hand back a button that submits nothing.
    setup({ disabled: true, pending: false });

    await advance(STALL_MS);

    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("retry restarts the clock", () => {
  it("puts the button back to working when the user tries again", async () => {
    // The red-team's finding. `pending` is still true (the first request is hung
    // and cannot be aborted), so a phase keyed on `pending` alone would never
    // re-run: the alert would stay on screen, the button would stay enabled, and
    // the user would fire request after request into silence.
    const { onRetry } = setup();
    await advance(STALL_MS);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Saving...");
  });

  it("stalls again if the retry hangs too, rather than giving up on the user", async () => {
    setup();
    await advance(STALL_MS);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
  });
});

describe("wait mode never hands back a button that could fire twice", () => {
  it("stays disabled on a stall and offers a safe way out instead of a retry", async () => {
    const { onRetry } = setup({ mode: "wait" });

    await advance(STALL_MS);

    // The alert still appears: the user is told what is happening. What they are
    // NOT given is a control that could double-charge them.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("cannot be re-fired by clicking the button underneath the stall message", async () => {
    const { onRetry } = setup({ mode: "wait" });
    await advance(STALL_MS);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe("why this cannot read useFormStatus itself", () => {
  // Phase 1 of #443 planned to keep the auth screens on <form action> and have
  // the button read the form's pending state. It cannot, and this test is the
  // proof, kept so we find out if React ever changes it.
  //
  // A bare component calling useFormStatus DOES go pending on submit (the
  // red-team claim that form actions do not work under happy-dom is false). Up
  // to React 19.2, adding a single useState plus an effect keyed on pending,
  // which is exactly what holding a phase requires, made the hook report idle
  // again while the action was still in flight.
  //
  // React 19.3 changed that, and this test caught it the way it was kept to
  // (#1062): the same component now stays pending. It asserts the new behaviour
  // so a regression back to the trap is caught too. The component still takes
  // `pending` from its caller; moving it onto the hook is a separate decision.
  it("keeps the pending signal while the component holds state (React 19.3 and later)", async () => {
    function Stateful() {
      const { pending } = useFormStatus();
      const [phase, setPhase] = useState("idle");
      useEffect(() => {
        setPhase(pending ? "working" : "idle");
      }, [pending]);
      return (
        <button type="submit">
          {pending ? "pending" : "idle"}:{phase}
        </button>
      );
    }

    const action = () => new Promise<void>(() => {});
    render(
      <form action={action}>
        <Stateful />
      </form>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await vi.advanceTimersByTimeAsync(0);
    });

    // The action IS in flight, and both the hook and the held phase say so.
    // Under React 19.2 this read "idle:idle", which was the trap.
    expect(screen.getByRole("button")).toHaveTextContent("pending:working");
  });
});

describe("lifecycle", () => {
  it("drops its timers when the button goes away mid-flight", async () => {
    // Most of these buttons redirect on success, so the component unmounts while
    // still pending. A timer that outlived it would set state on a dead
    // component, and in a stall-mode surface could fire after the user had
    // already moved on.
    function Host() {
      const [show, setShow] = useState(true);
      return (
        <div>
          <button onClick={() => setShow(false)}>unmount</button>
          {show && (
            <PendingButton
              pending
              mode="retry"
              idleLabel="Go"
              workingLabel="Going..."
            />
          )}
        </div>
      );
    }
    render(<Host />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "unmount" }));
    });
    await advance(STALL_MS * 2);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
