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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { useInFlight } from "./use-in-flight";
import { toast } from "sonner";
import { captureException } from "@sentry/nextjs";

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

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

/**
 * The same surface, plus the "Try again" a stalled retry-mode button offers.
 *
 * The action is handed `isLatest`, so it can tell whether it is still the attempt
 * that owns the surface, or a superseded one that should keep quiet (#669).
 */
function RetryHarness({
  approve,
  reject = () => {},
}: {
  approve: (isLatest: () => boolean) => Promise<void>;
  reject?: () => void;
}) {
  const { inFlight, busy, run, retry } = useInFlight<"approve" | "reject">();

  return (
    <div>
      <button
        onClick={() => run("approve", approve)}
        disabled={busy}
        data-testid="approve"
      >
        {inFlight === "approve" ? "Approving..." : "Approve"}
      </button>
      <button onClick={() => retry("approve", approve)} data-testid="retry">
        Try again
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

  it("lets a retry through the door that run() keeps shut", async () => {
    // #669. `run` refusing re-entry is what stops the neighbour firing, and that
    // has to stay. But the same refusal silently swallows a RETRY: a user presses
    // "Try again" on a stalled action and NOTHING happens. A retry needs its own
    // door.
    const approve = vi.fn(hang);
    render(<RetryHarness approve={approve} />);

    await click("approve");
    await click("retry");

    expect(approve).toHaveBeenCalledTimes(2);
  });

  it("will not let the superseded request report once the retry has taken over", async () => {
    // A retry does NOT cancel the first request. The hung one is still out there,
    // and when it lands it must stay silent, or it toasts a failure over work the
    // retry already did (#667).
    const reported: string[] = [];
    let releaseFirst: () => void = () => {};
    let attempt = 0;

    render(
      <RetryHarness
        approve={async (isLatest) => {
          const mine = ++attempt;
          if (mine === 1) {
            await new Promise<void>((r) => (releaseFirst = r));
          }
          if (!isLatest()) return;
          reported.push(mine === 1 ? "first" : "retry");
        }}
      />,
    );

    await click("approve");
    await click("retry");
    await act(async () => {
      releaseFirst();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(reported).toEqual(["retry"]);
  });

  it("does not let a late superseded request hand the surface back", async () => {
    // The superseded attempt finishing must not put the surface back to idle: the
    // retry is still working, and every button would come alive underneath it.
    let releaseFirst: () => void = () => {};
    let attempt = 0;

    render(
      <RetryHarness
        approve={async () => {
          const mine = ++attempt;
          if (mine === 1) {
            await new Promise<void>((r) => (releaseFirst = r));
            return;
          }
          await hang();
        }}
      />,
    );

    await click("approve");
    await click("retry");
    await act(async () => {
      releaseFirst();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByTestId("approve")).toBeDisabled();
    expect(screen.getByTestId("approve")).toHaveTextContent("Approving...");
  });

  it("reopens the gate once the newest attempt settles", async () => {
    // Otherwise the surface is bricked after one retry.
    const reject = vi.fn();
    let settle: () => void = () => {};
    let attempt = 0;

    render(
      <RetryHarness
        approve={async () => {
          const mine = ++attempt;
          if (mine === 1) return hang();
          await new Promise<void>((r) => (settle = r));
        }}
        reject={reject}
      />,
    );

    await click("approve");
    await click("retry");
    await act(async () => {
      settle();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByTestId("reject")).toBeEnabled();

    await click("reject");

    expect(reject).toHaveBeenCalledTimes(1);
  });

  it("keeps the surface standing when an action throws, and says what happened", async () => {
    // REVERSED in #987. This used to assert the opposite: the rejection was
    // let through so React would take the subtree down to the nearest error
    // boundary, described as "the loud failure we want". That was a choice made
    // while building the hook in #672, not a recorded decision, and #658, the
    // issue it shipped under, says nothing about it.
    //
    // What it actually bought was a generic error screen in place of the whole
    // admin surface, because one button's read failed. The property it cared
    // about, that a blown-up action must not look like nothing happened, is
    // answered better by the catch: the console, Sentry and the person are all
    // told, which is more than a boundary gives any of them. Asserted in the
    // "when the action rejects" block below.
    render(
      <Harness
        approve={async () => {
          throw new Error("boom");
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByTestId("reject")).toBeEnabled();
  });
});

// #987. The `finally` clears the flag on a rejection, so the button flicks back
// to its idle label and says nothing. Against the standing rule that working,
// still alive and failed must be visibly distinct, that is worse than the
// spinner it replaced: the person presses again, on a write that may already
// have landed. A throwing server action is not hypothetical here, because
// milestone 35 is converting readers behind these controls onto helpers that
// throw.
describe("when the action rejects", () => {
  it("says so, rather than flicking back to the idle label in silence", async () => {
    render(
      <Harness
        approve={async () => {
          throw new Error("the read failed");
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/try again/i);
  });

  it("reports the rejection, because a digest is all the client is given", async () => {
    const boom = new Error("the read failed");
    render(
      <Harness
        approve={async () => {
          throw boom;
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(captureException).toHaveBeenCalledWith(boom, {
      tags: { in_flight_action: "approve" },
    });
  });

  it("hands the surface back, so the person can act again", async () => {
    render(
      <Harness
        approve={async () => {
          throw new Error("the read failed");
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("approve")).toHaveTextContent("Approve");
    expect(screen.getByTestId("approve")).not.toBeDisabled();
  });

  it("lets a caller with something better to say replace the message", async () => {
    function Custom() {
      const { run } = useInFlight<"approve">({
        onError: () => toast.error("Couldn't reveal contact info. Try again."),
      });
      return (
        <button
          data-testid="approve"
          onClick={() =>
            run("approve", async () => {
              throw new Error("boom");
            })
          }
        />
      );
    }
    render(<Custom />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't reveal contact info. Try again.",
    );
  });

  it("stays quiet when a superseded attempt is the one that rejected", async () => {
    // The retry owns the surface. Reporting here would toast over its result
    // and hand back a control it is still using (#669).
    let failSuperseded: (() => void) | null = null;
    const approve = (isLatest: () => boolean) =>
      new Promise<void>((_resolve, reject) => {
        if (failSuperseded === null) {
          failSuperseded = () => reject(new Error("the superseded one"));
        }
        void isLatest;
      });

    render(<RetryHarness approve={approve} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("retry"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      failSuperseded?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
