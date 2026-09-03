// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ apply: vi.fn(), clearAll: vi.fn() }));
vi.mock("./useApplyFilters", () => ({
  useApplyFilters: () => ({
    apply: h.apply,
    clearAll: h.clearAll,
    currentFilters: vi.fn(),
  }),
}));

import { FilterSheet } from "./FilterSheet";
import { parseSearchParams } from "@/lib/nurses/search-params";

/**
 * On a phone the filters live in a sheet that covers the results. Applying a
 * filter and leaving the sheet open means the visitor has to dismiss it by
 * hand to see what her choice did (#779).
 */
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

async function openSheet() {
  render(<FilterSheet initialFilters={parseSearchParams({})} />);
  fireEvent.click(screen.getByLabelText(/open more filters/i));
  return screen.findByRole("dialog");
}

describe("FilterSheet", () => {
  it("closes itself once a filter is applied", async () => {
    const dialog = await openSheet();
    expect(dialog).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText(/within/i), {
      target: { value: "10" },
    });

    expect(h.apply).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes itself when everything is cleared", async () => {
    await openSheet();
    // The panel offers Clear all in more than one place; either is the same
    // action, so the first is enough.
    const [clearAll] = await screen.findAllByRole("button", {
      name: /clear all/i,
    });
    fireEvent.click(clearAll);

    expect(h.clearAll).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
