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
import { useInFlight } from "./use-in-flight";

// A surface with more than one async control (approve/reject, a row of icon
// buttons, a whole taxonomy list) needs to know WHICH action is running, not
// merely that one is. Driving them all from a single `pending` flag puts the
// working label on the button nobody pressed, and, worse, leaves the others
// live: an admin can reject while an approve is still in flight and fire two
// conflicting writes at one row.
//
// Hand-rolled three times before this (HireDecisionButtons, ReviewActionButtons,
// CommentModerationActions), so it is one hook now.

const hung: Array<() => void> = [];

function hang() {
  return new Promise<void>((resolve) => hung.push(resolve));
}

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  // Release hung actions before the next test: React entangles concurrent async
  // actions, so one left in flight stops the next from settling.
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

function Harness({ approve }: { approve: () => Promise<void> }) {
  const { inFlight, busy, run } = useInFlight<"approve" | "reject">();
  const reject = vi.fn();

  return (
    <div>
      <button
        onClick={() => run("approve", approve)}
        disabled={busy}
        data-testid="approve"
      >
        {inFlight === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        onClick={() => run("reject", async () => reject())}
        disabled={busy}
        data-testid="reject"
      >
        {inFlight === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}

async function click(id: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(id));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useInFlight", () => {
  it("shows the work on the control that was pressed, not on its neighbour", async () => {
    render(<Harness approve={hang} />);

    await click("approve");

    expect(screen.getByTestId("approve")).toHaveTextContent("Approving...");
    expect(screen.getByTestId("reject")).toHaveTextContent("Reject");
  });

  it("kills every control on the surface while one is in flight", async () => {
    render(<Harness approve={hang} />);

    await click("approve");

    expect(screen.getByTestId("approve")).toBeDisabled();
    expect(screen.getByTestId("reject")).toBeDisabled();
  });

  it("refuses a second action even if something gets past the disabled attribute", async () => {
    // The disabled attribute is the affordance, not the gate. The hook itself
    // has to refuse, or any other route to the handler fires a second write.
    const approve = vi.fn(hang);
    render(<Harness approve={approve} />);

    await click("approve");
    await click("approve");

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("hands the surface back once the action settles", async () => {
    let settle: () => void = () => {};
    render(<Harness approve={() => new Promise((r) => (settle = r))} />);

    await click("approve");
    await act(async () => {
      settle();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByTestId("approve")).toBeEnabled();
    expect(screen.getByTestId("approve")).toHaveTextContent("Approve");
    expect(screen.getByTestId("reject")).toBeEnabled();
  });

  it("does not swallow an action that throws", async () => {
    // An admin action that blew up has to reach the error boundary and Sentry,
    // not look like nothing happened. The hook lets it through: React takes the
    // subtree down to the nearest boundary, which is the loud failure we want
    // rather than a button that quietly goes back to idle as if it had worked.
    render(
      <Harness
        approve={async () => {
          throw new Error("boom");
        }}
      />,
    );

    await expect(
      act(async () => {
        fireEvent.click(screen.getByTestId("approve"));
        await vi.advanceTimersByTimeAsync(20);
      }),
    ).rejects.toThrow("boom");
  });
});
