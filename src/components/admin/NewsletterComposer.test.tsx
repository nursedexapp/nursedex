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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/newsletter/actions", () => ({ sendNewsletterIssue: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { NewsletterComposer } from "./NewsletterComposer";
import { STALL_MS } from "@/components/ui/pending-button";
import { sendNewsletterIssue } from "@/lib/newsletter/actions";
import { toast } from "sonner";

// Phase 4 of #443. The single most expensive button in the app to fire twice: it
// emails every confirmed subscriber. `wait` mode is not a preference here, it is
// the whole point. A stall must never hand an admin a live Send button.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // #674: the native confirm reduced "email 412 real people, irreversibly" to a
  // one-line grey prompt, and a mobile browser suppressing a repeat would have
  // sent the issue with no gate at all. The stub is a trap, not a pass.
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

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Open the confirmation dialog and go through with it. */
async function send() {
  render(<NewsletterComposer subscriberCount={412} />);
  await click(/send to 412/i);
  await click(/send now/i);
}

describe("sending a newsletter issue", () => {
  it("spells out who gets emailed, and sends to nobody until the admin confirms", async () => {
    render(<NewsletterComposer subscriberCount={412} />);

    await click(/send to 412/i);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/412 confirmed subscribers/i);
    expect(dialog).toHaveTextContent(/cannot be recalled|cannot be undone/i);
    expect(sendNewsletterIssue).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("emails nobody when the admin cancels", async () => {
    render(<NewsletterComposer subscriberCount={412} />);

    await click(/send to 412/i);
    await click(/cancel/i);

    expect(sendNewsletterIssue).not.toHaveBeenCalled();
  });

  it("refuses to open the dialog at all when there are no subscribers", async () => {
    render(<NewsletterComposer subscriberCount={0} />);

    await click(/send to 0/i);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sendNewsletterIssue).not.toHaveBeenCalled();
  });

  it("blocks a second send while the first is running", async () => {
    vi.mocked(sendNewsletterIssue).mockReturnValue(hang());
    await send();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    expect(sendNewsletterIssue).toHaveBeenCalledTimes(1);
  });

  it("never lets a stalled send be fired at 412 people a second time", async () => {
    vi.mocked(sendNewsletterIssue).mockReturnValue(hang());
    await send();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sending/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(sendNewsletterIssue).toHaveBeenCalledTimes(1);
  });

  it("gets out of the way on a validation failure so the admin can see the flagged fields", async () => {
    // The fields it is complaining about sit behind the dialog. Leaving the
    // dialog up would point the admin at errors they cannot see.
    vi.mocked(sendNewsletterIssue).mockResolvedValue({
      success: false,
      fieldErrors: { subject: "Required" },
    });
    await send();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send to 412/i })).toBeEnabled();
  });
});

/**
 * #422. Each batch reports whether it went, and the screen only ever showed
 * the number that did. An issue that reached nobody produced "Sent to 0
 * subscribers" in a success colour, which is the one thing this screen must
 * not do: the admin has no other way to learn it, and the subscribers who
 * missed it are invisible (L10).
 *
 * Driven through the same confirmation dialog as every other case here, so
 * these exercise the real path rather than the handler in isolation.
 */
describe("when some subscribers could not be reached", () => {
  it("does not call a partial send a success", async () => {
    vi.mocked(sendNewsletterIssue).mockResolvedValue({
      success: true,
      sent: 100,
      failed: 50,
    });

    await send();

    expect(toast.warning).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    const text = vi.mocked(toast.warning).mock.calls[0][0] as string;
    expect(text).toContain("100");
    expect(text).toContain("50");
  });

  it("says a second send would double up, rather than offering a retry", async () => {
    // Sending again delivers a second copy to everyone who already got it,
    // and there is no per issue send record yet to prevent that (#422).
    vi.mocked(sendNewsletterIssue).mockResolvedValue({
      success: true,
      sent: 10,
      failed: 2,
    });

    await send();

    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/second copy/i);
  });

  it("says nothing went out when nothing did, and that a retry is safe", async () => {
    // Nobody received it, so trying again cannot double up, and that is the
    // one thing the admin needs to know to act.
    vi.mocked(sendNewsletterIssue).mockResolvedValue({
      success: false,
      error: "send_failed",
      sent: 0,
      failed: 30,
    });

    await send();

    expect(toast.error).toHaveBeenCalled();
    const text = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(text).toMatch(/nothing was sent/i);
    expect(text).toMatch(/safe to try again/i);
    // Not the validation message: the fields are fine, and pointing the admin
    // at highlighted fields would send them looking for an error that is not
    // there.
    expect(text).not.toMatch(/highlighted fields/i);
  });

  it("still shows a plain success when everyone was reached", async () => {
    // The positive control for all three above.
    vi.mocked(sendNewsletterIssue).mockResolvedValue({
      success: true,
      sent: 150,
      failed: 0,
    });

    await send();

    expect(toast.success).toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
