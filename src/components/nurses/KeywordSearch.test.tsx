// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeywordSearch } from "./KeywordSearch";
import { parseSearchParams } from "@/lib/nurses/search-params";

const replace = vi.fn((url: string) => {
  window.history.replaceState({}, "", url);
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const flushCommit = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

function show(search = "") {
  window.history.replaceState({}, "", `/nurses${search}`);
  const filters = parseSearchParams(
    new URLSearchParams(search.replace(/^\?/, "")),
  );
  return render(<KeywordSearch filters={filters} />);
}

const lastUrl = () => replace.mock.calls.at(-1)?.[0] ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * #729. Structured filters cannot express "the nurse my neighbour
 * recommended, I think her name was Marisol", which is the commonest way
 * anybody arrives at a directory.
 */
describe("the keyword box", () => {
  it("puts what the family typed in the URL", () => {
    show();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "dementia" },
    });
    flushCommit();

    expect(lastUrl()).toBe("/nurses?q=dementia");
  });

  it("shows the keyword the URL already carries", () => {
    show("?q=ventilator");

    expect(screen.getByRole("searchbox")).toHaveValue("ventilator");
  });

  it("keeps the family's other filters when the keyword changes", () => {
    show("?credential=rn");

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "dementia" },
    });
    flushCommit();

    expect(lastUrl()).toContain("credential=rn");
    expect(lastUrl()).toContain("q=dementia");
  });

  it("offers a way to clear it that is a control at rest, not on hover", () => {
    show("?q=ventilator");

    const clear = screen.getByRole("button", { name: /clear search/i });
    expect(clear).toBeInTheDocument();

    fireEvent.click(clear);
    flushCommit();

    expect(lastUrl()).toBe("/nurses");
  });

  it("offers nothing to clear when the box is empty", () => {
    show();

    expect(screen.queryByRole("button", { name: /clear search/i })).toBeNull();
  });

  it("names itself, so it is reachable without seeing the placeholder", () => {
    show();

    expect(screen.getByLabelText(/search by name/i)).toBeInTheDocument();
  });
});
