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
import { STALL_MS } from "@/components/ui/pending-button";

// Phase 1 of #443. Every auth screen used to hand-roll its own submit button, so
// a hung sign-in or password reset looked exactly like a working one. These tests
// hold each screen to the three states: it says it is working, a hang becomes
// something the user can act on, and a failure gives the button back.
//
// The mode matters and is asserted per screen. Forgot password SENDS AN EMAIL,
// and Supabase rate-limits those, so a stall there must NOT hand back a button
// that sends a second one and gets itself throttled. Login and reset password are
// safe to repeat, so they must.

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  forgotPassword: vi.fn(),
  resendConfirmation: vi.fn(),
  resetPasswordRecovery: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/actions", () => ({
  signIn: h.signIn,
  forgotPassword: h.forgotPassword,
  resendConfirmation: h.resendConfirmation,
  resetPasswordRecovery: h.resetPasswordRecovery,
  signInWithGoogle: vi.fn(),
}));

import LoginPage from "./login/page";
import ForgotPasswordPage from "./forgot-password/page";
import { ResetPasswordForm } from "./reset-password/ResetPasswordForm";

const NEVER = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
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

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("login", () => {
  async function submit() {
    await act(async () => {
      type("Email", "nurse@example.com");
      type("Password", "correct horse battery");
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });
  }

  it("says it is signing in, and cannot be fired twice while it does", async () => {
    h.signIn.mockReturnValue(NEVER());
    render(<LoginPage />);

    await submit();

    const button = screen.getByRole("button", { name: /signing in/i });
    expect(button).toBeDisabled();
  });

  it("hands the button back when a sign-in hangs, because retrying is safe", async () => {
    h.signIn.mockReturnValue(NEVER());
    render(<LoginPage />);
    await submit();

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("gives the button back when sign-in comes back with an error", async () => {
    h.signIn.mockResolvedValue({ error: "Wrong password." });
    render(<LoginPage />);

    await submit();

    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });
});

describe("forgot password", () => {
  async function submit() {
    await act(async () => {
      type("Email", "nurse@example.com");
      fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    });
  }

  it("says it is sending", async () => {
    h.forgotPassword.mockReturnValue(NEVER());
    render(<ForgotPasswordPage />);

    await submit();

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("never hands back a button that would send a second reset email", async () => {
    // The whole reason this screen is `wait` and not `retry`.
    h.forgotPassword.mockReturnValue(NEVER());
    render(<ForgotPasswordPage />);
    await submit();

    await advance(STALL_MS);

    // The user is told what is happening...
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // ...but is given no control that fires the email again.
    expect(screen.getByRole("button")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(h.forgotPassword).toHaveBeenCalledTimes(1);
  });
});

describe("reset password", () => {
  async function submit() {
    await act(async () => {
      type("New password", "correct horse battery");
      type("Confirm password", "correct horse battery");
      fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    });
  }

  it("says it is updating, then hands the button back on a hang", async () => {
    h.resetPasswordRecovery.mockReturnValue(NEVER());
    render(<ResetPasswordForm />);

    await submit();
    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });
});
