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

// Phase 4 of #443. Suspending locks a real person out and emails them; removing
// soft-deletes them, cancels their Stripe subscriptions and blocks their email
// from signing up again. Both are `wait` mode: nothing here is safe to fire
// twice, and removal is described in its own dialog as reversible only by hand.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("confirm", () => true);
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
  it("blocks a second suspend while the first is running", async () => {
    vi.mocked(suspendAccount).mockReturnValue(hang());
    setup();

    await click(/^suspend$/i);

    expect(screen.getByRole("button", { name: /suspending/i })).toBeDisabled();
    expect(suspendAccount).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never emails the user twice", async () => {
    vi.mocked(suspendAccount).mockReturnValue(hang());
    setup();

    await click(/^suspend$/i);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await click(/suspending/i);

    expect(suspendAccount).toHaveBeenCalledTimes(1);
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
