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

async function deleteThePost() {
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

describe("acting on a post", () => {
  it("blocks the menu while an action is running", async () => {
    h.deletePost.mockReturnValue(hang());
    await deleteThePost();

    expect(
      screen.getByRole("button", { name: /post actions/i }),
    ).toBeDisabled();
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

  it("hands the menu back when the action really fails", async () => {
    h.deletePost.mockResolvedValue({ success: false });
    await deleteThePost();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post actions/i })).toBeEnabled();
  });
});
