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

vi.mock("@/lib/admin/verification-actions", () => ({
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { VerificationRowActions } from "./VerificationRowActions";
import { STALL_MS } from "@/components/ui/pending-button";
import {
  approveVerification,
  rejectVerification,
} from "@/lib/admin/verification-actions";
import { toast } from "sonner";

// Phase 4 of #443. Approving a nurse sends her a real verification email, so a
// second fire is a second email to a real person: `wait` mode, no retry.
//
// It stays wait even though #652 landed a database guard against the double
// write. The guard makes a repeat apply return `wrong_state`, and every one of
// these components maps a failure to "Could not approve. Please try again." So a
// retry after a hung-but-successful approve would tell the admin it FAILED when
// it worked. Graduating these to retry needs that "already applied" case handled
// first, which is tracked in #669.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // #674: approve is behind a real dialog now, not a native confirm. The stub is
  // here to catch the native one being called, not to wave it through.
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

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Open the confirmation dialog and go through with it. */
async function clickApprove() {
  render(<VerificationRowActions userId="u1" nurseFirstName="Sam" />);
  await click(/^approve$/i);
  await click(/approve verification/i);
}

describe("approving a verification", () => {
  it("asks in a real dialog, and approves nobody until the admin confirms", async () => {
    render(<VerificationRowActions userId="u1" nurseFirstName="Sam" />);

    await click(/^approve$/i);

    expect(screen.getByRole("dialog")).toHaveTextContent(/email/i);
    expect(approveVerification).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("approves nobody when the admin cancels", async () => {
    render(<VerificationRowActions userId="u1" nurseFirstName="Sam" />);

    await click(/^approve$/i);
    await click(/cancel/i);

    expect(approveVerification).not.toHaveBeenCalled();
  });

  it("blocks a second approve while the first is running", async () => {
    vi.mocked(approveVerification).mockReturnValue(hang());
    await clickApprove();

    expect(screen.getByRole("button", { name: /approving/i })).toBeDisabled();
    expect(approveVerification).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never sends a second email", async () => {
    vi.mocked(approveVerification).mockReturnValue(hang());
    await clickApprove();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /approving/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(approveVerification).toHaveBeenCalledTimes(1);
  });

  it("lets the toast own a failure and hands the button back", async () => {
    vi.mocked(approveVerification).mockResolvedValue({ success: false });
    await clickApprove();

    expect(toast.error).toHaveBeenCalledWith(
      "Could not approve. Please try again.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The dialog stays up on failure, so the admin can see it did not work and
    // try again from where they are.
    expect(
      screen.getByRole("button", { name: /approve verification/i }),
    ).toBeEnabled();
  });

  it("says which step is missing when the profile is unfinished", async () => {
    // "Please try again" would name an action that cannot fix this: trying
    // again refuses again, because only the nurse can finish her profile
    // (#912). So this failure gets its own sentence.
    vi.mocked(approveVerification).mockResolvedValue({
      success: false,
      error: "incomplete",
      missingStep: "Credentials",
    });
    await clickApprove();

    const said = vi.mocked(toast.error).mock.calls.at(-1)?.[0];
    expect(said).toContain("Credentials");
    expect(said).not.toContain("try again");
  });
});

describe("rejecting a verification", () => {
  async function openAndReject() {
    render(<VerificationRowActions userId="u1" nurseFirstName="Sam" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: "Credential expired" },
      });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("stays disabled on a stall and never sends a second rejection email", async () => {
    vi.mocked(rejectVerification).mockReturnValue(hang());
    await openAndReject();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(rejectVerification).toHaveBeenCalledTimes(1);
  });
});
