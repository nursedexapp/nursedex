// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { NurseDashboardHero } from "./NurseDashboardHero";

/**
 * A verified nurse whose profile is empty is not listed in the directory
 * (#732). Before this, she was shown "Your profile is live. Families in New
 * York can now find you", which was the single most misleading sentence in the
 * product: 40 of the 100 verified nurses had nothing on their profile at all.
 *
 * The unlisted state has to beat the first-time celebration as well, because
 * that is the version of the claim she sees first.
 */
beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

const base = { status: "verified" as const, slug: "jane-doe" };

describe("NurseDashboardHero, verified but not listed", () => {
  it("does not tell her families can find her", () => {
    render(<NurseDashboardHero {...base} score={0} listed={false} />);
    expect(screen.queryByText(/families .* can now find you/i)).toBeNull();
    expect(screen.queryByText(/your profile is live/i)).toBeNull();
  });

  it("says she is not in search yet and what will fix it", () => {
    render(<NurseDashboardHero {...base} score={0} listed={false} />);
    expect(screen.getByText(/not showing in search/i)).toBeInTheDocument();
    expect(screen.getByText(/photo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/dashboard/edit",
    );
  });

  it("beats the first-time celebration", () => {
    // No celebration flag stored: a first visit, which is when the
    // celebration would otherwise render.
    render(<NurseDashboardHero {...base} score={0} listed={false} />);
    expect(screen.queryByText(/welcome to nursedex/i)).toBeNull();
  });
});

describe("NurseDashboardHero, verified and listed", () => {
  it("still says a partly filled profile is live", () => {
    window.localStorage.setItem("nursedex.celebrated.verified", "1");
    render(<NurseDashboardHero {...base} score={40} listed={true} />);
    expect(screen.getByText(/your profile is live/i)).toBeInTheDocument();
  });
});
