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
      <FilterPanel initialFilters={defaultFilters()} />,
    );
    const input = screen.getByPlaceholderText("e.g. 5");

    fireEvent.change(input, { target: { value: "1" } });
    // Simulate the re-render that arrives before the URL has updated.
    rerender(<FilterPanel initialFilters={defaultFilters()} />);
    fireEvent.change(input, { target: { value: "15" } });
    rerender(<FilterPanel initialFilters={defaultFilters()} />);

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
      <FilterPanel initialFilters={defaultFilters()} />,
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
      rerender(<FilterPanel initialFilters={defaultFilters()} />);
      fireEvent.change(input, { target: { value: "12" } });
      rerender(<FilterPanel initialFilters={defaultFilters()} />);
      expect(input.value).toBe("12");
    }
  });

  it("commits the zip code only once five digits are entered", () => {
    render(<FilterPanel initialFilters={defaultFilters()} />);
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
    render(<FilterPanel initialFilters={defaultFilters()} />);
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
      <FilterPanel initialFilters={defaultFilters()} />,
    );
    const input = screen.getByPlaceholderText("e.g. 5");

    fireEvent.change(input, { target: { value: "15" } });
    flushCommit();
    // The navigation lands and the URL now carries the committed value.
    rerender(
      <FilterPanel
        initialFilters={parseSearchParams({ experience_min: "15" })}
      />,
    );
    expect(input).toHaveValue(15);

    // Clear all (or back navigation) drops the param; the field follows.
    rerender(<FilterPanel initialFilters={defaultFilters()} />);
    expect(input).toHaveValue(null);
  });
});
