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

vi.mock("@/lib/admin/account-actions", () => ({
  suspendAccount: vi.fn(),
  unsuspendAccount: vi.fn(),
  removeAccount: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AccountRowActions } from "./AccountRowActions";
import { STALL_MS } from "@/components/ui/pending-button";
import { suspendAccount, removeAccount } from "@/lib/admin/account-actions";
import { toast } from "sonner";

// Phase 4 of #443. Suspending locks a real person out and emails them; removing
// soft-deletes them, cancels their Stripe subscriptions and blocks their email
// from signing up again. Both are `wait` mode: nothing here is safe to fire
// twice, and removal is described in its own dialog as reversible only by hand.
//
// #674 moved suspend behind the same real dialog. The old native confirm could
// not say what suspending does, and mobile browsers can suppress a repeated
// confirm outright, which would have suspended someone with no gate at all.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Not stubbed to `() => true` any more. Nothing here may reach for the native
  // dialog, so the stub exists only to catch it if something does.
  vi.stubGlobal("confirm", vi.fn());
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup() {
  render(
    <AccountRowActions
      userId="u1"
      email="nurse@example.com"
      isSuspended={false}
      isDeleted={false}
    />,
  );
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("suspending an account", () => {
  it("asks in a real dialog, and suspends nobody until the admin confirms", async () => {
    setup();

    await click(/^suspend$/i);

    expect(screen.getByRole("dialog")).toHaveTextContent(/locked out/i);
    expect(suspendAccount).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("suspends nobody when the admin cancels", async () => {
    setup();

    await click(/^suspend$/i);
    await click(/cancel/i);

    expect(suspendAccount).not.toHaveBeenCalled();
  });

  it("blocks a second suspend while the first is running", async () => {
    vi.mocked(suspendAccount).mockReturnValue(hang());
    setup();

    await click(/^suspend$/i);
    await click(/suspend account/i);

    expect(screen.getByRole("button", { name: /suspending/i })).toBeDisabled();
    expect(suspendAccount).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never emails the user twice", async () => {
    vi.mocked(suspendAccount).mockReturnValue(hang());
    setup();

    await click(/^suspend$/i);
    await click(/suspend account/i);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await click(/suspending/i);

    expect(suspendAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open on failure so the admin can see it did not work", async () => {
    vi.mocked(suspendAccount).mockResolvedValue({
      success: false,
      error: "unknown",
    });
    setup();

    await click(/^suspend$/i);
    await click(/suspend account/i);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("removing an account", () => {
  async function openAndRemove() {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: "Repeated policy violations" },
      });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("stays disabled on a stall and never removes the account twice", async () => {
    // This one cancels Stripe subscriptions and blocklists the email. A second
    // fire is not a harmless repeat.
    vi.mocked(removeAccount).mockReturnValue(hang());
    await openAndRemove();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(removeAccount).toHaveBeenCalledTimes(1);
  });
});

// #982. Three outcomes that "Could not remove. Please try again." reads as, and
// is wrong about in two of them: the ban was not written (retrying works), the
// removal happened but was not recorded (retrying cannot help and would report
// wrong_state), and the account could not be read at all.
describe("what the admin is told when a removal partly fails", () => {
  async function removeWith(error: string) {
    cleanup();
    vi.mocked(removeAccount).mockResolvedValue({
      success: false,
      error: error as never,
    });
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: "Repeated policy violations" },
      });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });
    return vi.mocked(toast.error).mock.calls.at(-1)?.[0] as string;
  }

  it("says nothing was done when the block list write failed", async () => {
    const message = await removeWith("ban_unwritten");
    expect(message).toMatch(/block list/i);
    expect(message).toMatch(/try again/i);
  });

  it("does not tell the admin to try again when the removal already happened", async () => {
    // Retrying would come back wrong_state, so "please try again" sends them
    // round a loop that cannot end.
    const message = await removeWith("audit_unwritten");
    expect(message).toMatch(/removed/i);
    expect(message).not.toMatch(/try again/i);
  });

  it("gives every outcome its own message", async () => {
    const messages = new Set([
      await removeWith("ban_unwritten"),
      await removeWith("audit_unwritten"),
      await removeWith("lookup_failed"),
      await removeWith("unknown"),
      await removeWith("not_found"),
      await removeWith("wrong_state"),
      await removeWith("invalid"),
      await removeWith("self_action"),
    ]);
    expect(messages.size).toBe(8);
  });
});
