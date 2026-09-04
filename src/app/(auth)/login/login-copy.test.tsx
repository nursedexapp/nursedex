// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/actions", () => ({
  signIn: vi.fn(),
  resendConfirmation: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

import LoginPage from "./page";

afterEach(cleanup);

/**
 * The sign in page is the product's front door (#764).
 *
 * "New here? Create an account" trailed the welcome sentence inline, and the
 * two together were longer than the form column at every width, so it wrapped
 * mid phrase: "...is waiting. New / here? Create an account". The form column
 * is max-w-md on desktop too, so a wider window never saved it.
 */
describe("the sign up invitation on the sign in page", () => {
  it("is a whole phrase in its own block, not a tail on the sentence", () => {
    render(<LoginPage />);

    const link = screen.getByRole("link", { name: "New here? Create an account" });
    const block = link.closest("p");

    expect(block).not.toBeNull();
    // The block holds the link and nothing else, so there is no earlier text
    // for a line break to land in the middle of.
    expect(block!.textContent?.trim()).toBe("New here? Create an account");
  });

  it("keeps the welcome sentence in a block of its own", () => {
    render(<LoginPage />);

    const sentence = screen.getByText(/Your New York care community is waiting\./);
    expect(sentence.textContent?.trim()).toBe(
      "Your New York care community is waiting.",
    );
  });

  it("still points at signup", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("link", { name: "New here? Create an account" }),
    ).toHaveAttribute("href", "/signup");
  });
});
