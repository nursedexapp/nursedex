// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const h = vi.hoisted(() => ({
  renameCategory: vi.fn(),
  mergeCategory: vi.fn(),
  deleteCategory: vi.fn(),
  renameTag: vi.fn(),
  mergeTag: vi.fn(),
  deleteTag: vi.fn(),
}));
vi.mock("@/lib/blog/taxonomy-actions", () => h);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TaxonomyManager } from "./TaxonomyManager";
import { STALL_MS } from "@/components/ui/pending-button";
import type { CategoryWithCount } from "@/lib/blog/queries";

// Phase 4 of #443. Deleting or merging a category rewrites every post that used
// it, so `wait` mode. The bug worth pinning here is scope: one shared pending
// flag disabled EVERY row in the list at once and spun EVERY row's menu, so an
// admin deleting one tag saw the whole page seize up with no way to tell which
// row was actually working.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // #674: rename, merge and delete are behind real dialogs now. These stubs are
  // traps for the native ones, not a way to wave them through. The rename in
  // particular was a window.prompt, which cannot be styled or labelled at all.
  vi.stubGlobal("confirm", vi.fn());
  vi.stubGlobal("prompt", vi.fn());
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Only the fields the manager renders. The timestamps on CategoryWithCount never
// reach the UI, hence the cast.
const categories = [
  { id: "c1", name: "Caregiving", slug: "caregiving", postCount: 4 },
  { id: "c2", name: "Hiring", slug: "hiring", postCount: 1 },
] as unknown as CategoryWithCount[];

function setup() {
  render(<TaxonomyManager categories={categories} tags={[]} />);
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Open a row's menu and pick an item, which opens that item's dialog. */
async function pick(row: string, item: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `${row} actions` }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function deleteRow(name: string) {
  await pick(name, /delete/i);
  await click(/delete category/i);
}

describe("deleting a category", () => {
  it("asks in a real dialog, naming what happens to the posts using it", async () => {
    setup();

    await pick("Caregiving", /delete/i);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/4 posts/i);
    expect(dialog).toHaveTextContent(/left uncategorized/i);
    expect(dialog).toHaveTextContent(/not deleted/i);
    expect(h.deleteCategory).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("deletes nothing when the admin cancels", async () => {
    setup();

    await pick("Caregiving", /delete/i);
    await click(/cancel/i);

    expect(h.deleteCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blocks a second delete while the first is running", async () => {
    h.deleteCategory.mockReturnValue(hang());
    setup();

    await deleteRow("Caregiving");

    expect(h.deleteCategory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
  });

  it("says it is stalled and never offers a retry", async () => {
    h.deleteCategory.mockReturnValue(hang());
    setup();

    await deleteRow("Caregiving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(h.deleteCategory).toHaveBeenCalledTimes(1);
  });

  it("hands the confirm button back when the delete really fails", async () => {
    h.deleteCategory.mockResolvedValue({ success: false });
    setup();

    await deleteRow("Caregiving");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete category/i }),
    ).toBeEnabled();
  });
});

describe("renaming a category", () => {
  it("uses a real labelled field prefilled with the current name, never window.prompt", async () => {
    setup();

    await pick("Caregiving", /rename/i);

    expect(screen.getByLabelText(/new name/i)).toHaveValue("Caregiving");
    expect(window.prompt).not.toHaveBeenCalled();
    expect(h.renameCategory).not.toHaveBeenCalled();
  });

  it("refuses to rename to nothing, or to the name it already has", async () => {
    setup();

    await pick("Caregiving", /rename/i);

    // Unchanged: nothing to do.
    expect(
      screen.getByRole("button", { name: /rename category/i }),
    ).toBeDisabled();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/new name/i), {
        target: { value: "   " },
      });
    });

    expect(
      screen.getByRole("button", { name: /rename category/i }),
    ).toBeDisabled();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(h.renameCategory).not.toHaveBeenCalled();
  });

  it("renames to the typed name once the admin confirms", async () => {
    h.renameCategory.mockResolvedValue({ success: true });
    setup();

    await pick("Caregiving", /rename/i);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/new name/i), {
        target: { value: "Care at home" },
      });
    });
    await click(/rename category/i);

    expect(h.renameCategory).toHaveBeenCalledWith("c1", "Care at home");
  });
});

describe("merging a category", () => {
  it("names both sides and what happens to the posts, before doing anything", async () => {
    h.mergeCategory.mockResolvedValue({ success: true });
    setup();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Caregiving actions" }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /merge into/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /hiring/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/caregiving/i);
    expect(dialog).toHaveTextContent(/hiring/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    expect(h.mergeCategory).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();

    await click(/merge into hiring/i);

    expect(h.mergeCategory).toHaveBeenCalledWith("c1", "c2");
  });
});
