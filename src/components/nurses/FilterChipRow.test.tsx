// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterChipRow } from "./FilterChipRow";
import { parseSearchParams } from "@/lib/nurses/search-params";

const replace = vi.fn((url: string) => {
  window.history.replaceState({}, "", url);
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function show(search = "") {
  window.history.replaceState({}, "", `/nurses${search}`);
  const filters = parseSearchParams(
    new URLSearchParams(search.replace(/^\?/, "")),
  );
  return render(<FilterChipRow filters={filters} />);
}

const lastUrl = () => replace.mock.calls.at(-1)?.[0] ?? "";

beforeEach(() => {
  replace.mockClear();
});

afterEach(cleanup);

describe("the resting row", () => {
  it("offers the seven chips plus More filters", () => {
    show();
    for (const label of [
      "Credential",
      "Care type",
      "Skills",
      "Languages",
      "Gender",
      "Rate",
      "Experience",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("More filters")).toBeInTheDocument();
  });

  it("says a chip is collapsed until it is opened", () => {
    show();
    expect(screen.getByRole("button", { name: "Credential" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("offers no Clear all when nothing is applied", () => {
    show();
    expect(
      screen.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
  });

  it("shows no count on More filters when none of its filters are set", () => {
    show();
    expect(
      screen.getByText("More filters").parentElement,
    ).not.toHaveTextContent(/\d/);
  });
});

describe("an applied chip", () => {
  // Decision D6: it relabels itself with the value and carries an x.
  it("carries the value in its label", () => {
    show("?credential=rn");
    expect(
      screen.getByRole("button", { name: "Credential: Registered Nurse" }),
    ).toBeInTheDocument();
  });

  it("carries a clear button that is a control at rest, not on hover", () => {
    show("?credential=rn");
    const clear = screen.getByRole("button", {
      name: "Clear Credential: Registered Nurse",
    });
    expect(clear).toBeVisible();
  });

  it("clears only itself", () => {
    show("?credential=rn&languages=Spanish");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear Credential: Registered Nurse",
      }),
    );
    expect(lastUrl()).toBe("/nurses?languages=Spanish");
  });

  it("clears both ends of a rate when the rate chip is cleared", () => {
    show("?rate_min=20&rate_max=40");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear Rate: $20 to $40" }),
    );
    expect(lastUrl()).toBe("/nurses");
  });

  it("offers Clear all once something is applied", () => {
    show("?credential=rn");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(lastUrl()).toBe("/nurses");
  });
});

// Location lives behind More filters, and it is the filter that most visibly
// constrains results. A family arriving from the survey with a zip set would
// otherwise see a row showing nothing applied above a thin grid.
describe("a filter that lives behind More filters", () => {
  it("still appears on the row when it is applied", () => {
    show("?zip=11779&distance=25");
    expect(screen.getByText("Location: 25 miles of 11779")).toBeInTheDocument();
  });

  it("is clearable from the row without opening the sheet", () => {
    show("?zip=11779&distance=25");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear Location: 25 miles of 11779" }),
    );
    expect(lastUrl()).toBe("/nurses");
  });

  it("counts itself on the More filters button", () => {
    show("?zip=11779&time_slots=overnights");
    expect(screen.getByText("More filters").parentElement).toHaveTextContent(
      "2",
    );
  });

  it("does not appear on the row when it is not applied", () => {
    show("?credential=rn");
    expect(screen.queryByText(/^Location/)).not.toBeInTheDocument();
  });
});

describe("keyboard reach", () => {
  it("gives every chip and every clear a real button", () => {
    show("?credential=rn&zip=11779");
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("disabled");
    }
  });
});
