// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { ConsentSection } from "./ConsentSection";

afterEach(cleanup);

describe("ConsentSection", () => {
  it("renders the error as an alert and no stats", () => {
    render(
      <ConsentSection
        consent={{
          status: "error",
          days: 30,
          message: "The banner counts could not be read.",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Cookie banner, last 30 days" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The banner counts could not be read.",
    );
    expect(screen.queryByText("Browsers shown")).toBeNull();
  });

  it("names the period it was read over, from the tally itself", () => {
    render(
      <ConsentSection
        consent={{
          status: "ok",
          days: 7,
          shown: 0,
          accepted: 0,
          declined: 0,
          acceptRate: null,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Cookie banner, last 7 days" }),
    ).toBeInTheDocument();
  });

  it("renders the three stats and the note when ok", () => {
    render(
      <ConsentSection
        consent={{
          status: "ok",
          days: 30,
          shown: 100,
          accepted: 60,
          declined: 30,
          acceptRate: 0.6,
        }}
      />,
    );
    // Each value read inside its own stat, so a number elsewhere on the
    // section (the period in the title, the note) cannot satisfy it.
    const stat = (label: string) =>
      within(
        screen.getByText(label).closest("[data-slot=card]") as HTMLElement,
      );
    expect(stat("Browsers shown").getByText("100")).toBeInTheDocument();
    expect(stat("Accepted").getByText("60")).toBeInTheDocument();
    expect(stat("Declined").getByText("30")).toBeInTheDocument();
    expect(
      screen.getByText(/60% of browsers shown the banner/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
