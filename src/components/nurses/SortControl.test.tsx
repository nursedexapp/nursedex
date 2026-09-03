// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("./useApplyFilters", () => ({
  useApplyFilters: () => ({ apply: h.apply, clearAll: vi.fn(), currentFilters: vi.fn() }),
}));

import { SortControl } from "./SortControl";

/**
 * The family had no say in the order at all and no way to see what it was
 * (#725). The control says which order she is looking at and lets her change
 * it, and the change goes into the URL like every other filter so the search
 * can be shared and reloaded.
 */
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SortControl", () => {
  it("has a label a screen reader can announce", () => {
    render(<SortControl value="best" hasZip={false} />);
    expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
  });

  it("shows the order currently in effect", () => {
    render(<SortControl value="complete" hasZip={false} />);
    expect(screen.getByLabelText(/sort/i)).toHaveValue("complete");
  });

  it("offers closest once there is a zip to measure from", () => {
    render(<SortControl value="best" hasZip />);
    expect(screen.getByRole("option", { name: /closest/i })).toBeInTheDocument();
  });

  it("does not offer closest with no zip, since it cannot be honoured", () => {
    render(<SortControl value="best" hasZip={false} />);
    expect(screen.queryByRole("option", { name: /closest/i })).toBeNull();
  });

  it("puts the chosen order in the URL", () => {
    render(<SortControl value="best" hasZip={false} />);
    fireEvent.change(screen.getByLabelText(/sort/i), {
      target: { value: "rating" },
    });
    expect(h.apply).toHaveBeenCalledWith({ sort: "rating" });
  });

  it("ignores a change to the order already in effect", () => {
    // Otherwise every re-render of the select can push an identical URL and
    // send the page through another server round trip for nothing.
    render(<SortControl value="rating" hasZip={false} />);
    fireEvent.change(screen.getByLabelText(/sort/i), {
      target: { value: "rating" },
    });
    expect(h.apply).not.toHaveBeenCalled();
  });
});
