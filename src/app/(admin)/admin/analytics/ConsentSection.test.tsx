// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
          message: "The banner counts could not be read.",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The banner counts could not be read.",
    );
    expect(screen.queryByText("Browsers shown")).toBeNull();
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
    expect(screen.getByText("Cookie banner, last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Browsers shown")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(
      screen.getByText(/60% of browsers shown the banner/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
