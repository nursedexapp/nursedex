// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NotListedNudge } from "./NotListedNudge";

/**
 * There are two ways to be missing from the directory since #940, and this
 * email is sent to a real person about her own profile, so it has to name the
 * right one. Telling a nurse who has just added a photo that her profile has
 * no photo is worse than saying nothing: it reads as the product not looking.
 */
afterEach(cleanup);

describe("NotListedNudge", () => {
  it("asks for a photo or a bio when that is what is missing", () => {
    render(<NotListedNudge firstName="Nia" gaps={["content"]} />);
    expect(screen.getByText(/photo or a few lines/i)).toBeInTheDocument();
    expect(screen.queryByText(/type of care/i)).toBeNull();
  });

  it("asks for the care type when that is what is missing", () => {
    render(<NotListedNudge firstName="Nia" gaps={["care_type"]} />);
    expect(screen.getByText(/type of care/i)).toBeInTheDocument();
    // She has a photo or a bio. Saying otherwise would be false.
    expect(screen.queryByText(/no photo and no bio/i)).toBeNull();
  });

  it("asks for both when both are missing", () => {
    render(<NotListedNudge firstName="Nia" gaps={["content", "care_type"]} />);
    expect(screen.getByText(/photo or a few lines/i)).toBeInTheDocument();
    expect(screen.getByText(/type of care/i)).toBeInTheDocument();
  });
});
