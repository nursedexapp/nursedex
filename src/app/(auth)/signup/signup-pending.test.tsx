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

// #665. The signup button paired useFormStatus with local state, which destroys
// the pending signal: the state update re-renders the component outside the
// form's transition and `pending` reads false again while the request is still in
// flight. So clicking "Join NurseDex" left the button reading "Join NurseDex",
// enabled, for the whole of a signup. No spinner, no feedback, and a second click
// available the entire time on the action that creates an account and sends mail.

const h = vi.hoisted(() => ({
  signUp: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/actions", () => ({
  signUp: h.signUp,
  signInWithGoogle: vi.fn(),
}));
vi.mock("@/lib/family/actions", () => ({ setSurveyHandoffCookie: vi.fn() }));

import SignUpPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "nurse@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct horse battery" },
  });
  fireEvent.click(screen.getByRole("button", { name: /join nursedex/i }));
}

describe("signup submit button", () => {
  it("shows it is working, and cannot be fired again, while signing up", async () => {
    // A signup that has not come back yet.
    h.signUp.mockReturnValue(new Promise(() => {}));
    render(<SignUpPage />);

    await act(async () => {
      fillAndSubmit();
    });

    const button = screen.getByRole("button", { name: /joining/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Joining...");
  });

  it("gives the button back when signup comes back with an error", async () => {
    h.signUp.mockResolvedValue({ error: "That email is already registered." });
    render(<SignUpPage />);

    await act(async () => {
      fillAndSubmit();
    });

    expect(
      screen.getByRole("button", { name: /join nursedex/i }),
    ).toBeEnabled();
  });
});
