// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Everything referenced inside a vi.mock factory must be created in
// vi.hoisted, because vi.mock is lifted above the imports.
const h = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const remove = vi.fn();
  const state: { result: { data: unknown; error: unknown } } = {
    result: { data: { id: "p1" }, error: null },
  };
  const calls: { insert: unknown[]; update: unknown[] } = {
    insert: [],
    update: [],
  };
  function builder() {
    const b: Record<string, unknown> = {};
    b.insert = (payload: unknown) => {
      calls.insert.push(payload);
      return b;
    };
    b.update = (payload: unknown) => {
      calls.update.push(payload);
      return b;
    };
    for (const m of ["delete", "select", "eq"]) {
      b[m] = () => b;
    }
    b.single = () => Promise.resolve(state.result);
    b.maybeSingle = () => Promise.resolve(state.result);
    b.then = (resolve: (v: unknown) => void) => resolve(state.result);
    return b;
  }
  return { revalidatePath, remove, state, calls, builder };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth/helpers", () => ({
  requireAdmin: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("./slug", () => ({ ensureUniqueSlug: async () => "my-post" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => h.builder(),
    storage: { from: () => ({ remove: h.remove }) },
  }),
}));

// Taxonomy uses the service-role client (server-only); mock it so the test
// loads and so we can assert the post-save tag sync.
const tax = vi.hoisted(() => ({
  findOrCreateTags: vi.fn(),
  syncPostTags: vi.fn(),
  findOrCreateCategory: vi.fn(),
}));
vi.mock("./taxonomy", () => tax);

const redir = vi.hoisted(() => ({ saveBlogSlugRedirect: vi.fn() }));
vi.mock("./redirects", () => redir);

// Revisions use the service-role client (server-only); mock so the test
// loads. Snapshotting on save is exercised separately in revisions.test.ts.
const rev = vi.hoisted(() => ({
  snapshotRevision: vi.fn(),
  getRevision: vi.fn(),
}));
vi.mock("./revisions", () => rev);

import { savePost, autosavePost, deletePost, createCategory } from "./actions";

const PUB = (p: string) =>
  `https://x.supabase.co/storage/v1/object/public/blog-images/${p}`;

const validContent = {
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.result = { data: { id: "p1" }, error: null };
  h.calls.insert = [];
  h.calls.update = [];
  h.remove.mockResolvedValue({ error: null });
  tax.findOrCreateTags.mockResolvedValue([]);
  tax.syncPostTags.mockResolvedValue(undefined);
  tax.findOrCreateCategory.mockResolvedValue("cat-1");
  redir.saveBlogSlugRedirect.mockResolvedValue(undefined);
});

describe("savePost", () => {
  it("creates a draft and revalidates the blog surfaces", async () => {
    const res = await savePost({
      intent: "draft",
      title: "My Post",
      content: validContent,
    });
    expect(res.success).toBe(true);
    expect(res.slug).toBe("my-post");
    // The body is flattened to content_text for full text search.
    expect(h.calls.insert[0]).toMatchObject({ content_text: "hello" });
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog");
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/my-post");
  });

  it("rejects invalid input with field errors and does not revalidate", async () => {
    const res = await savePost({ intent: "draft", title: "", content: validContent });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.title).toBeTruthy();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects scheduling in the past", async () => {
    const res = await savePost({
      intent: "schedule",
      title: "My Post",
      content: validContent,
      publish_at: "2020-01-01T00:00:00.000Z",
    });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.publish_at).toBeTruthy();
  });
});

describe("autosavePost", () => {
  it("creates a draft for a new post and returns its id", async () => {
    const res = await autosavePost({ title: "My Post", content: validContent });
    expect(res.success).toBe(true);
    expect(res.id).toBe("p1");
    expect(h.calls.insert).toHaveLength(1);
    expect(h.calls.insert[0]).toMatchObject({ status: "draft", publish_at: null });
    // Autosave never revalidates public surfaces.
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates an existing post without touching status or publish_at", async () => {
    const res = await autosavePost({
      id: "00000000-0000-4000-8000-000000000007",
      title: "My Post",
      content: validContent,
    });
    expect(res.success).toBe(true);
    expect(h.calls.update).toHaveLength(1);
    const payload = h.calls.update[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("publish_at");
    expect(payload).not.toHaveProperty("author_id");
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects input without a title", async () => {
    const res = await autosavePost({ title: "", content: validContent });
    expect(res.success).toBe(false);
    expect(h.calls.insert).toHaveLength(0);
  });
});

describe("deletePost", () => {
  it("removes the deleted post's cover and inline images from storage", async () => {
    h.state.result = {
      data: {
        cover_image_url: PUB("blog/2026/cover.jpg"),
        content: {
          type: "doc",
          content: [{ type: "image", attrs: { src: PUB("blog/2026/inline.png") } }],
        },
      },
      error: null,
    };

    const res = await deletePost("00000000-0000-4000-8000-000000000009");
    expect(res.success).toBe(true);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove.mock.calls[0][0].sort()).toEqual([
      "blog/2026/cover.jpg",
      "blog/2026/inline.png",
    ]);
  });
});

describe("post taxonomy", () => {
  const categoryId = "00000000-0000-4000-8000-00000000000c";

  it("savePost persists category_id and syncs resolved tags", async () => {
    tax.findOrCreateTags.mockResolvedValue(["t1", "t2"]);
    const res = await savePost({
      intent: "draft",
      title: "My Post",
      content: validContent,
      category_id: categoryId,
      tags: ["Home Care", "Licensing"],
    });
    expect(res.success).toBe(true);
    expect(h.calls.insert[0]).toMatchObject({ category_id: categoryId });
    expect(tax.findOrCreateTags).toHaveBeenCalledWith(["Home Care", "Licensing"]);
    expect(tax.syncPostTags).toHaveBeenCalledWith("p1", ["t1", "t2"]);
  });

  it("autosavePost syncs tags without touching status", async () => {
    tax.findOrCreateTags.mockResolvedValue(["t1"]);
    const res = await autosavePost({
      id: "00000000-0000-4000-8000-00000000000a",
      title: "My Post",
      content: validContent,
      tags: ["Home Care"],
    });
    expect(res.success).toBe(true);
    const payload = h.calls.update[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status");
    expect(tax.syncPostTags).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-00000000000a",
      ["t1"],
    );
  });
});

describe("createCategory", () => {
  it("creates a category and returns its id and name", async () => {
    tax.findOrCreateCategory.mockResolvedValue("cat-9");
    const res = await createCategory("Home Care");
    expect(res.success).toBe(true);
    expect(res.category).toEqual({ id: "cat-9", name: "Home Care" });
    expect(tax.findOrCreateCategory).toHaveBeenCalledWith("Home Care");
  });

  it("rejects a blank name", async () => {
    const res = await createCategory("   ");
    expect(res.success).toBe(false);
    expect(tax.findOrCreateCategory).not.toHaveBeenCalled();
  });
});

describe("slug redirects on save", () => {
  const id = "00000000-0000-4000-8000-00000000000b";

  it("records a redirect when a published post's slug changes", async () => {
    h.state.result = {
      data: { id, slug: "old-slug", status: "published" },
      error: null,
    };
    const res = await savePost({
      id,
      intent: "publish",
      title: "My Post",
      content: validContent,
    });
    expect(res.success).toBe(true);
    // ensureUniqueSlug is mocked to return "my-post".
    expect(redir.saveBlogSlugRedirect).toHaveBeenCalledWith(
      "old-slug",
      "my-post",
      id,
    );
  });

  it("does not record a redirect for a draft slug change", async () => {
    h.state.result = {
      data: { id, slug: "old-slug", status: "draft" },
      error: null,
    };
    await savePost({ id, intent: "draft", title: "My Post", content: validContent });
    expect(redir.saveBlogSlugRedirect).not.toHaveBeenCalled();
  });

  it("does not record a redirect when the slug is unchanged", async () => {
    h.state.result = {
      data: { id, slug: "my-post", status: "published" },
      error: null,
    };
    await savePost({ id, intent: "publish", title: "My Post", content: validContent });
    expect(redir.saveBlogSlugRedirect).not.toHaveBeenCalled();
  });
});
