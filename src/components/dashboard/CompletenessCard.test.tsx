// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CompletenessCard } from "./CompletenessCard";

/**
 * The missing list read as housekeeping. Nurses were never told that a fuller
 * profile means a better position in search, which is now true and was still
 * unstated (#730).
 *
 * The claim has to stay honest: Featured placement still outranks a complete
 * free profile, so the copy must not promise she can reach the top by filling
 * things in.
 */
afterEach(cleanup);

const missing = [
  { label: "Add a professional photo", points: 15 },
  { label: "Write your bio", points: 15 },
  { label: "Add your skills", points: 10 },
];

describe("CompletenessCard", () => {
  it("says a fuller profile ranks higher in search", () => {
    render(<CompletenessCard score={60} missing={missing} />);
    expect(screen.getByText(/search/i)).toBeInTheDocument();
  });

  it("says what each item is worth", () => {
    render(<CompletenessCard score={60} missing={missing} />);
    expect(screen.getAllByText(/\+15/).length).toBeGreaterThan(0);
  });

  it("does not promise she can reach the top", () => {
    render(<CompletenessCard score={60} missing={missing} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/top of|first in search|number one/i);
  });

  it("says plainly that featured nurses still come first", () => {
    render(<CompletenessCard score={60} missing={missing} />);
    expect(screen.getByText(/featured/i)).toBeInTheDocument();
  });

  it("congratulates a finished profile without mentioning points", () => {
    render(<CompletenessCard score={100} missing={[]} />);
    expect(screen.getByText(/fully filled in/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\+\d/);
  });
});
