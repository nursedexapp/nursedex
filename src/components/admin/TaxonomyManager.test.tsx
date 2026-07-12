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
  vi.stubGlobal("confirm", () => true);
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

// Open a row's menu and hit Delete.
async function deleteRow(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `${name} actions` }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("deleting a category", () => {
  it("blocks a second delete while the first is running", async () => {
    h.deleteCategory.mockReturnValue(hang());
    setup();

    await deleteRow("Caregiving");

    expect(h.deleteCategory).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /Caregiving actions/ }),
    ).toBeDisabled();
  });

  it("says the row is stalled and never offers a retry", async () => {
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

  it("hands the list back when the delete really fails", async () => {
    h.deleteCategory.mockResolvedValue({ success: false });
    setup();

    await deleteRow("Caregiving");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Caregiving actions/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Hiring actions/ }),
    ).toBeEnabled();
  });
});
