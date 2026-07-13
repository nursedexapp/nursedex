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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// The tiptap editor brings a DOM stack happy-dom cannot usefully run, and none
// of it is what this file is about.
vi.mock("@/components/blog/PostEditor", () => ({
  PostEditor: () => <div data-testid="editor" />,
}));
vi.mock("@/components/blog/DateTimePicker", () => ({
  DateTimePicker: () => <div />,
}));
vi.mock("@/lib/blog/preview-draft", () => ({ writePreviewDraft: vi.fn() }));
vi.mock("@/lib/blog/actions", () => ({
  savePost: vi.fn(),
  autosavePost: vi.fn(),
  createCategory: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PostEditorForm } from "./PostEditorForm";
import { STALL_MS } from "@/components/ui/pending-button";
import { savePost } from "@/lib/blog/actions";

// #669 phase 5, and the reason this one is NOT a blanket graduation.
//
// savePost decides create-vs-update from whether it was handed an id. With no id
// it INSERTS, and ensureUniqueSlug gives a second insert a DIFFERENT slug rather
// than colliding, so nothing in the database stops it: a retry on a hung save of
// a BRAND NEW post leaves the author with two posts.
//
// Once the post exists it is a plain UPDATE by id, which is safe to repeat. So
// the button offers a retry only then, and a new post keeps the old behaviour.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

const EXISTING = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "An existing post",
  slug: "an-existing-post",
  excerpt: null,
  content: { type: "doc", content: [] },
  cover_image_url: null,
  seo_title: null,
  seo_description: null,
  category_id: null,
  status: "draft",
  publish_at: null,
} as unknown as Parameters<typeof PostEditorForm>[0]["post"];

function renderForm(post: unknown) {
  render(
    <PostEditorForm
      post={post as never}
      categories={[]}
      allTags={[]}
      postTags={[]}
    />,
  );
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function stall() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STALL_MS);
  });
}

describe("saving a post that already exists", () => {
  it("offers a retry on a stall, because saving it again is the same update", async () => {
    vi.mocked(savePost).mockReturnValue(hang());
    renderForm(EXISTING);

    await click(/save draft/i);
    await stall();

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await click(/try again/i);

    expect(savePost).toHaveBeenCalledTimes(2);
    // Both saves carried the id, so both are updates to the SAME row.
    const ids = vi
      .mocked(savePost)
      .mock.calls.map((c) => (c[0] as { id?: string }).id);
    expect(ids).toEqual([EXISTING!.id, EXISTING!.id]);
  });

  it("does not let the superseded save toast over the retry", async () => {
    const { toast } = await import("sonner");
    let releaseFirst!: (v: unknown) => void;
    vi.mocked(savePost)
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseFirst = r as (v: unknown) => void;
        }),
      )
      .mockResolvedValueOnce({ success: true, id: EXISTING!.id });

    renderForm(EXISTING);
    await click(/save draft/i);
    await stall();
    await click(/try again/i);

    vi.mocked(toast.error).mockClear();

    await act(async () => {
      releaseFirst({ success: false });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("saving a post that does not exist yet", () => {
  // This used to REFUSE a retry. savePost with no id inserted, and the second
  // insert was handed its own slug rather than colliding, so a retry on a hung
  // save quietly left the author with two posts. Refusing the retry was the
  // workaround, and it stranded the author of a new post in front of a hung save
  // with nothing to press.
  //
  // The editor now mints the post's id up front and both save paths create under
  // it (#696), so a repeat collides on the primary key. The retry is safe, and
  // the tests below are the ones that say so.
  it("offers a retry on a stall, now that a second save cannot duplicate the post", async () => {
    vi.mocked(savePost).mockReturnValue(hang());
    renderForm(undefined);

    await click(/save draft/i);
    await stall();

    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("sends a minted id with a brand-new post, rather than letting the server invent one", async () => {
    vi.mocked(savePost).mockResolvedValue({ success: true });
    renderForm(undefined);

    await click(/save draft/i);

    expect(savePost).toHaveBeenCalledWith(
      expect.objectContaining({
        id: undefined,
        new_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
  });

  it("retries under the SAME minted id, so the retry cannot become a second post", async () => {
    // The load-bearing assertion for #696. A retry that minted a fresh id would
    // look like a brand-new post to the database, which is the duplicate we set
    // out to prevent.
    vi.mocked(savePost).mockReturnValue(hang());
    renderForm(undefined);

    await click(/save draft/i);
    await stall();
    await click(/try again/i);

    const calls = vi.mocked(savePost).mock.calls;
    expect(calls).toHaveLength(2);
    const first = calls[0][0] as { new_id: string };
    const second = calls[1][0] as { new_id: string };
    expect(second.new_id).toBe(first.new_id);
  });
});
