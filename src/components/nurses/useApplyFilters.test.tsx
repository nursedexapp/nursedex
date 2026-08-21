// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useApplyFilters } from "./useApplyFilters";
import type { SearchFilters } from "@/lib/nurses/search-params";

/**
 * The router mock behaves like the real one in the way that matters here: a
 * replace() updates the URL immediately, while the server render that would
 * refresh any props lags behind. That lag is the whole bug (#775).
 */
const replace = vi.fn((url: string) => {
  window.history.replaceState({}, "", url);
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

let applyRef: (next: Partial<SearchFilters>) => void;
let clearAllRef: () => void;

function Harness() {
  const { apply, clearAll } = useApplyFilters();
  applyRef = apply;
  clearAllRef = clearAll;
  return null;
}

function lastUrl(): string {
  return replace.mock.calls.at(-1)?.[0] ?? "";
}

beforeEach(() => {
  replace.mockClear();
  window.history.replaceState({}, "", "/nurses");
  render(<Harness />);
});

afterEach(cleanup);

describe("useApplyFilters", () => {
  it("puts a single filter in the URL", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    expect(lastUrl()).toBe("/nurses?credential=rn");
  });

  // The regression this exists for. Two changes in a row, with NO re-render
  // in between, which is exactly what happens when a family clicks a second
  // chip while the first transition is still in flight.
  it("keeps the first filter when a second lands before any re-render", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => applyRef({ care_type: "elderly" as SearchFilters["care_type"] }));
    expect(lastUrl()).toContain("credential=rn");
    expect(lastUrl()).toContain("care_type=elderly");
  });

  it("accumulates across several changes", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => applyRef({ languages: ["Spanish"] }));
    act(() => applyRef({ experience_min: 5 }));
    const url = lastUrl();
    expect(url).toContain("credential=rn");
    expect(url).toContain("languages=Spanish");
    expect(url).toContain("experience_min=5");
  });

  it("replaces the value when the same filter is set twice", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => applyRef({ credential: "lpn" as SearchFilters["credential"] }));
    expect(lastUrl()).toBe("/nurses?credential=lpn");
  });

  it("clears one filter without disturbing the others", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => applyRef({ languages: ["Spanish"] }));
    act(() => applyRef({ credential: undefined }));
    expect(lastUrl()).toBe("/nurses?languages=Spanish");
  });

  it("drops back to a bare path when the last filter goes", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => applyRef({ credential: undefined }));
    expect(lastUrl()).toBe("/nurses");
  });

  // A filter change changes the size of the result set, so the page the
  // family was on usually does not exist any more.
  it("resets to page one on any change", () => {
    window.history.replaceState({}, "", "/nurses?page=4&credential=rn");
    act(() => applyRef({ care_type: "elderly" as SearchFilters["care_type"] }));
    expect(lastUrl()).not.toContain("page=");
  });

  it("clearAll goes back to the bare directory", () => {
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    act(() => clearAllRef());
    expect(lastUrl()).toBe("/nurses");
  });

  it("reads filters already in the URL on arrival", () => {
    window.history.replaceState({}, "", "/nurses?zip=11779&distance=25");
    act(() => applyRef({ credential: "rn" as SearchFilters["credential"] }));
    const url = lastUrl();
    expect(url).toContain("zip=11779");
    expect(url).toContain("distance=25");
    expect(url).toContain("credential=rn");
  });
});
