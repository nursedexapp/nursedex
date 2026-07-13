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
  archivePost: vi.fn(),
  unpublishPost: vi.fn(),
  publishNow: vi.fn(),
  deletePost: vi.fn(),
  togglePinned: vi.fn(),
}));
vi.mock("@/lib/blog/actions", () => h);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { BlogPostActions } from "./BlogPostActions";
import { STALL_MS } from "@/components/ui/pending-button";
import { BlogPostStatus } from "@/types/enums";

// Phase 4 of #443. Publishing puts a post live and deleting takes it away, so
// `wait` mode. The control is a menu behind an icon trigger, too small for the
// stall panel, so it borrows the shared clock and renders its own alert.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // #674: behind a real dialog now. The stub is a trap for the native one.
  vi.stubGlobal("confirm", vi.fn());
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

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/**
 * Open the menu and pick Delete, which opens the confirmation dialog.
 *
 * The dialog is a SIBLING of the menu, not a child of it: a dialog rendered
 * inside the menu is unmounted the instant the menu closes, so the confirmation
 * would flash and vanish and Delete would look like it did nothing (#674).
 */
async function pickDelete() {
  render(
    <BlogPostActions
      id="p1"
      slug="a-post"
      status={BlogPostStatus.DRAFT}
      pinned={false}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /post actions/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function deleteThePost() {
  await pickDelete();
  await click(/delete post/i);
}

describe("confirming a delete", () => {
  it("survives the menu closing, and deletes nothing until the admin confirms", async () => {
    await pickDelete();

    expect(screen.getByRole("dialog")).toHaveTextContent(/cannot be undone/i);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(h.deletePost).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("deletes nothing when the admin cancels", async () => {
    await pickDelete();
    await click(/cancel/i);

    expect(h.deletePost).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("acting on a post", () => {
  it("blocks a second delete while the first is running", async () => {
    h.deletePost.mockReturnValue(hang());
    await deleteThePost();

    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
    expect(h.deletePost).toHaveBeenCalledTimes(1);
  });

  it("says it is stalled and never offers a retry", async () => {
    h.deletePost.mockReturnValue(hang());
    await deleteThePost();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(h.deletePost).toHaveBeenCalledTimes(1);
  });

  it("hands the confirm button back when the delete really fails", async () => {
    h.deletePost.mockResolvedValue({ success: false });
    await deleteThePost();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete post/i })).toBeEnabled();
  });
});

// The unconfirmed actions still run straight off the menu, so the menu itself is
// still what has to go dead while one is in flight.
describe("acting on a post from the menu, with no confirmation", () => {
  async function publish() {
    render(
      <BlogPostActions
        id="p1"
        slug="a-post"
        status={BlogPostStatus.DRAFT}
        pinned={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /post actions/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /publish now/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("blocks the menu while an action is running", async () => {
    h.publishNow.mockReturnValue(hang());
    await publish();

    expect(
      screen.getByRole("button", { name: /post actions/i }),
    ).toBeDisabled();
    expect(h.publishNow).toHaveBeenCalledTimes(1);
  });

  it("says it is stalled and never offers a retry", async () => {
    h.publishNow.mockReturnValue(hang());
    await publish();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(h.publishNow).toHaveBeenCalledTimes(1);
  });

  it("hands the menu back when the action really fails", async () => {
    h.publishNow.mockResolvedValue({ success: false });
    await publish();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post actions/i })).toBeEnabled();
  });
});
