// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { FilterPanel } from "./FilterPanel";
import { parseSearchParams } from "@/lib/nurses/search-params";
import { directoryFacets as facets } from "../../../test/facets-fixture";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const defaultFilters = () => parseSearchParams({});

// Let the debounced commit fire.
const flushCommit = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FilterPanel free text inputs", () => {
  // Regression: the experience input was controlled directly by the URL
  // state, so the transition re-render after each keystroke reset the field
  // to the stale value and double digit entries were impossible.
  it("keeps a double digit years of experience value while the URL lags behind", () => {
    const { rerender } = render(
      <FilterPanel initialFilters={defaultFilters()} facets={facets()} />,
    );
    const input = screen.getByPlaceholderText("e.g. 5");

    fireEvent.change(input, { target: { value: "1" } });
    // Simulate the re-render that arrives before the URL has updated.
    rerender(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
    fireEvent.change(input, { target: { value: "15" } });
    rerender(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(input).toHaveValue(15);

    flushCommit();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/nurses?experience_min=15", {
      scroll: false,
    });
  });

  // Sweep every free text input in the panel for the same bug class:
  // typing must survive a re-render with stale (not yet navigated) filters.
  it("no free text input loses characters to a stale re-render", () => {
    const { rerender } = render(
      <FilterPanel initialFilters={defaultFilters()} facets={facets()} />,
    );
    const textInputs: HTMLInputElement[] = [
      ...screen.getAllByRole<HTMLInputElement>("spinbutton"),
      screen.getByLabelText<HTMLInputElement>(/your zip code/i),
    ];
    // Update this count (and the typing sweep below) when adding a new free
    // text input to the panel so it gets the same coverage.
    expect(textInputs).toHaveLength(3);

    for (const input of textInputs) {
      fireEvent.change(input, { target: { value: "1" } });
      rerender(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
      fireEvent.change(input, { target: { value: "12" } });
      rerender(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
      expect(input.value).toBe("12");
    }
  });

  it("commits the zip code only once five digits are entered", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
    const zip = screen.getByLabelText(/your zip code/i);

    fireEvent.change(zip, { target: { value: "117" } });
    flushCommit();
    expect(replace).toHaveBeenLastCalledWith("/nurses", { scroll: false });

    fireEvent.change(zip, { target: { value: "11779" } });
    flushCommit();
    expect(replace).toHaveBeenLastCalledWith("/nurses?zip=11779", {
      scroll: false,
    });
  });

  it("hints that a partial zip is not filtering, and clears the hint at five digits", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
    const zip = screen.getByLabelText<HTMLInputElement>(/your zip code/i);
    const hint = /enter all 5 digits/i;

    // Empty: no hint.
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    // Partial: the field is not committing a filter, so surface that.
    fireEvent.change(zip, { target: { value: "117" } });
    const hintEl = screen.getByText(hint);
    expect(hintEl).toBeInTheDocument();
    expect(zip).toHaveAccessibleDescription(/enter all 5 digits/i);

    // Five digits: the filter commits, so the hint goes away.
    fireEvent.change(zip, { target: { value: "11779" } });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it("clearing a field removes its filter from the URL", () => {
    render(
      <FilterPanel
        initialFilters={parseSearchParams({ experience_min: "15" })}
        facets={facets()}
      />,
    );
    const input = screen.getByPlaceholderText("e.g. 5");
    expect(input).toHaveValue(15);

    fireEvent.change(input, { target: { value: "" } });
    flushCommit();
    expect(replace).toHaveBeenLastCalledWith("/nurses", { scroll: false });
  });

  it("adopts an external URL change once the edit has committed", () => {
    const { rerender } = render(
      <FilterPanel initialFilters={defaultFilters()} facets={facets()} />,
    );
    const input = screen.getByPlaceholderText("e.g. 5");

    fireEvent.change(input, { target: { value: "15" } });
    flushCommit();
    // The navigation lands and the URL now carries the committed value.
    rerender(
      <FilterPanel
        initialFilters={parseSearchParams({ experience_min: "15" })}
        facets={facets()}
      />,
    );
    expect(input).toHaveValue(15);

    // Clear all (or back navigation) drops the param; the field follows.
    rerender(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);
    expect(input).toHaveValue(null);
  });
});

/**
 * #766. Every option here used to come from a TypeScript enum or a hardcoded
 * array, so the panel offered filters with nobody behind them: a family could
 * tick exactly one box and land on "No nurses match your filters yet". We
 * suggested the filter, so we implied there was somebody behind it.
 */
describe("FilterPanel options come from the directory", () => {
  it("does not offer a language nobody in the directory speaks", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(screen.queryByRole("checkbox", { name: /Russian/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Portuguese/ })).toBeNull();
  });

  it("offers a language nurses do speak that the hardcoded list left out", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(screen.getByRole("checkbox", { name: /French \(3\)/ })).toBeInTheDocument();
  });

  it("shows how many nurses are behind each option", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(screen.getByRole("checkbox", { name: "Spanish (8)" })).toBeInTheDocument();
  });

  it("omits a whole section when no nurse has any value for it", () => {
    render(
      <FilterPanel
        initialFilters={defaultFilters()}
        facets={facets({ time_slots: [] })}
      />,
    );

    expect(screen.queryByText("Time slots")).toBeNull();
    expect(screen.getByText("Availability")).toBeInTheDocument();
  });

  it("does not offer a credential nobody holds", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(screen.getByRole("option", { name: /Registered Nurse \(34\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Nurse Practitioner/ })).toBeNull();
  });

  it("bounds years of experience at the most experienced nurse, since asking for more returns nobody", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    expect(screen.getByPlaceholderText("e.g. 5")).toHaveAttribute("max", "49");
  });

  it("hints at the rates nurses actually charge without refusing a lower budget", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={facets()} />);

    // A hint, not a bound: a nurse who states no minimum matches every
    // budget, so a budget under the cheapest stated rate still returns her.
    expect(screen.getByText(/\$20 to \$175/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 40")).not.toHaveAttribute("min", "20");
  });

  it("says the options could not be loaded rather than showing a panel with none", () => {
    render(<FilterPanel initialFilters={defaultFilters()} facets={null} />);

    // An empty panel and a failed read look identical, and one of them is a
    // lie about the directory (#780).
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    expect(screen.queryByText("Languages")).toBeNull();
    // The controls that need no facets still work, so a family can still
    // search by location.
    expect(screen.getByLabelText("Your zip code")).toBeInTheDocument();
  });
});
