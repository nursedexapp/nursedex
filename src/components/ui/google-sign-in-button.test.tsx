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

// #444. The button set loading on submit and only ever cleared it from a
// visibilitychange listener, while signInWithGoogle swallowed the Supabase error
// and returned void. Nothing navigated, nothing threw, nothing reset: any
// failure to start Google sign-in left the user staring at "Connecting..."
// forever, on the primary social path into the product, with no error, no retry
// and no way forward.

const h = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));

vi.mock("@/lib/auth/actions", () => ({
  signInWithGoogle: h.signInWithGoogle,
}));

import { GoogleSignInButton, STALL_MS } from "./google-sign-in-button";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function clickButton() {
  return act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
  });
}

describe("GoogleSignInButton", () => {
  it("shows Connecting... while the sign-in is starting", async () => {
    h.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    render(<GoogleSignInButton />);

    await clickButton();

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Connecting...");
  });

  it("surfaces the error and lets the user try again when sign-in cannot start", async () => {
    h.signInWithGoogle.mockResolvedValue({ error: "Google is unavailable." });
    render(<GoogleSignInButton />);

    await clickButton();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google is unavailable.",
    );
    // The whole point: the button comes back, so there is a way forward.
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).toHaveTextContent(
      "Continue with Google",
    );
  });

  it("turns a hang into an actionable error instead of spinning forever", async () => {
    // The failure this issue is actually about. If the action never comes back
    // at all (the request dies, the tab loses the network), there is no error to
    // surface and no navigation: a spinner that looks identical whether it is
    // working, hung, or dead. A stall timeout is what tells those apart.
    vi.useFakeTimers();
    h.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    render(<GoogleSignInButton />);

    await clickButton();
    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("stays quiet on the success path, which navigates away rather than returning", async () => {
    // A successful start redirects to Google, so the action resolves with
    // nothing. Treating "no error returned" as a failure would flash a bogus
    // error over the top of a sign-in that is working.
    h.signInWithGoogle.mockResolvedValue(undefined);
    render(<GoogleSignInButton />);

    await clickButton();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Connecting...");
  });

  it("clears a previous error when the user retries", async () => {
    h.signInWithGoogle.mockResolvedValue({ error: "Google is unavailable." });
    render(<GoogleSignInButton />);
    await clickButton();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    h.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    await clickButton();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
