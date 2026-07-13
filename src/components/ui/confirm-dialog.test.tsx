// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

import { ConfirmDialog } from "./confirm-dialog";
import { STALL_MS } from "./pending-button";

// The one confirmation primitive (#674). Eight admin components gated their
// destructive writes behind window.confirm, which cannot be styled, cannot lay
// out the real consequence, and which some mobile browsers suppress outright
// after a few fires, letting a destructive action through with NO confirmation.
//
// So the bar here is higher than "a dialog appears": the action must not fire
// until the admin explicitly confirms, it must not fire at all if they cancel,
// and it must not fire TWICE when the first attempt hangs.

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Nothing in this component may reach for the native dialog. A leftover call
  // would otherwise sail through happy-dom and look like a pass.
  vi.stubGlobal("confirm", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

/** A host that owns the open/pending state, the way every real caller does. */
function Host({
  onConfirm,
  pending = false,
  children,
  confirmDisabled,
}: {
  onConfirm: () => void;
  pending?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger="Delete"
      triggerVariant="destructive"
      title="Delete this post"
      description="This permanently removes the post. It cannot be undone."
      confirmLabel="Delete post"
      workingLabel="Deleting..."
      slowLabel="Still deleting..."
      pending={pending}
      onConfirm={onConfirm}
      confirmDisabled={confirmDisabled}
    >
      {children}
    </ConfirmDialog>
  );
}

describe("ConfirmDialog", () => {
  it("does not touch the native confirm, and does not act until the admin confirms", async () => {
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await click(/^delete$/i);

    // The consequence is spelled out, not reduced to a one-line grey prompt.
    expect(screen.getByRole("dialog")).toHaveTextContent(/cannot be undone/i);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();

    await click(/delete post/i);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when the admin cancels", async () => {
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await click(/^delete$/i);
    await click(/cancel/i);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("will not fire the action twice while it is still running", async () => {
    // A disabled button stops the button, not the form: submitting the form
    // again (Enter in a field) has to be refused by the handler too.
    const onConfirm = vi.fn();
    const { rerender } = render(<Host onConfirm={onConfirm} />);

    await click(/^delete$/i);
    await click(/delete post/i);
    rerender(<Host onConfirm={onConfirm} pending />);

    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirm button dead when the action stalls, rather than handing it back", async () => {
    // wait, not retry. These actions email real people and delete real rows;
    // re-firing a hung one duplicates the side effect.
    const onConfirm = vi.fn();
    const { rerender } = render(<Host onConfirm={onConfirm} />);

    await click(/^delete$/i);
    await click(/delete post/i);
    rerender(<Host onConfirm={onConfirm} pending />);
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await click(/deleting/i);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("blocks confirming while the caller says the input is incomplete", async () => {
    // The rename dialog needs this: an empty name must not be submittable.
    const onConfirm = vi.fn();
    render(
      <Host onConfirm={onConfirm} confirmDisabled>
        <input aria-label="New name" />
      </Host>,
    );

    await click(/^delete$/i);

    expect(screen.getByLabelText(/new name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete post/i })).toBeDisabled();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
