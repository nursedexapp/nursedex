// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterChipRow } from "./FilterChipRow";
import { parseSearchParams } from "@/lib/nurses/search-params";
import type { DirectoryFacets } from "@/lib/nurses/facets";
import { directoryFacets } from "../../../test/facets-fixture";

const replace = vi.fn((url: string) => {
  window.history.replaceState({}, "", url);
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function show(
  search = "",
  savedCount: number | null = null,
  facets: DirectoryFacets | null = directoryFacets(),
) {
  window.history.replaceState({}, "", `/nurses${search}`);
  const filters = parseSearchParams(
    new URLSearchParams(search.replace(/^\?/, "")),
  );
  return render(
    <FilterChipRow
      filters={filters}
      savedCount={savedCount}
      facets={facets}
    />,
  );
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

// Decision D10. It earns its place by composing with the other filters, which
// /dashboard/saved cannot do.
describe("the Saved only chip", () => {
  it("is absent for a viewer with no saved list", () => {
    show("", null);
    expect(
      screen.queryByRole("button", { name: /Saved/ }),
    ).not.toBeInTheDocument();
  });

  it("carries the family's total, not the page's", () => {
    show("", 12);
    expect(screen.getByRole("button", { name: /Saved/ })).toHaveTextContent(
      "(12)",
    );
  });

  it("shows zero rather than hiding itself for a family with no saves", () => {
    show("", 0);
    expect(screen.getByRole("button", { name: /Saved/ })).toHaveTextContent(
      "(0)",
    );
  });

  it("turns the constraint on", () => {
    show("", 3);
    fireEvent.click(screen.getByRole("button", { name: /Saved/ }));
    expect(lastUrl()).toBe("/nurses?saved=true");
  });

  it("turns it back off", () => {
    show("?saved=true", 3);
    fireEvent.click(screen.getByRole("button", { name: /Saved/ }));
    expect(lastUrl()).toBe("/nurses");
  });

  it("says whether it is on", () => {
    show("?saved=true", 3);
    expect(screen.getByRole("button", { name: /Saved/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("composes with another filter rather than replacing it", () => {
    show("?credential=rn", 3);
    fireEvent.click(screen.getByRole("button", { name: /Saved/ }));
    expect(lastUrl()).toContain("credential=rn");
    expect(lastUrl()).toContain("saved=true");
  });

  it("counts towards Clear all", () => {
    show("?saved=true", 3);
    expect(
      screen.getByRole("button", { name: "Clear all" }),
    ).toBeInTheDocument();
  });
});

// Both clear controls are the same thing, drawn the same way. One of them used
// a text times character where the other used an icon, which is an
// inconsistency a screen reader cannot see and a contrast probe reads as text.
describe("the clear controls", () => {
  it("draw an icon, never a text character", () => {
    const { container } = render(
      <FilterChipRow
        filters={parseSearchParams(
          new URLSearchParams("credential=rn&zip=11779"),
        )}
        savedCount={null}
        facets={directoryFacets()}
      />,
    );
    expect(container.textContent).not.toContain("\u00d7");
    // Both chips are applied, so both clear controls are on screen.
    expect(
      container.querySelectorAll("svg.lucide-x, svg[class*='lucide-x']").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("labels each one with what it clears", () => {
    show("?credential=rn&zip=11779");
    expect(
      screen.getByRole("button", { name: /Clear Credential/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Clear Location/ }),
    ).toBeInTheDocument();
  });
});

/**
 * #766. The chips carried their own copy of the language list and read every
 * other option straight off a TypeScript enum, so the row offered filters
 * with nobody behind them and hid languages nurses had entered.
 */
describe("chip options come from the directory", () => {
  const open = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name }));

  it("offers only the languages nurses actually speak", () => {
    show();
    open("Languages");

    expect(screen.queryByRole("checkbox", { name: /Russian/ })).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /French \(3\)/ }),
    ).toBeInTheDocument();
  });

  it("does not offer a credential nobody holds", () => {
    show();
    open("Credential");

    expect(screen.getByRole("radio", { name: /Registered Nurse \(34\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Nurse Practitioner/ })).toBeNull();
  });

  it("does not offer a chip whose filter has nobody behind any option", () => {
    show("", null, directoryFacets({ skills: [] }));

    expect(screen.queryByRole("button", { name: "Skills" })).toBeNull();
    expect(screen.getByRole("button", { name: "Languages" })).toBeInTheDocument();
  });

  it("says the options could not be loaded rather than dropping the row in silence", () => {
    show("", null, null);

    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    // The filters that need no counting still work.
    expect(screen.getByRole("button", { name: "Rate" })).toBeInTheDocument();
  });
});
