// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LicenceNumberNeeded } from "./LicenceNumberNeeded";

/**
 * This email goes to nurses who were verified without a licence number on
 * file (#912). It must not repeat the claim the rejection email makes, that
 * our team checked a licence and found a problem, because nobody checked
 * anything: there was no number to check.
 */
afterEach(cleanup);

describe("LicenceNumberNeeded", () => {
  it("asks for the number and says the verification is paused", () => {
    render(<LicenceNumberNeeded firstName="Nia" />);
    expect(screen.getByText(/license number, Nia/i)).toBeInTheDocument();
    expect(screen.getByText(/paused until you add it/i)).toBeInTheDocument();
  });

  it("does not claim anybody checked a licence", () => {
    render(<LicenceNumberNeeded firstName="Nia" />);
    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/ran into the following issue/i);
    expect(page).not.toMatch(/could not verify your license/i);
    expect(page).not.toMatch(/expired|invalid|does not match/i);
  });

  it("says whose mistake it was", () => {
    render(<LicenceNumberNeeded />);
    expect(
      screen.getByText(/our mistake rather than yours/i),
    ).toBeInTheDocument();
  });
});
