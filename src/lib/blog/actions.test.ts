// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Everything referenced inside a vi.mock factory must be created in
// vi.hoisted, because vi.mock is lifted above the imports.
const h = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const state: { result: { data: unknown; error: unknown } } = {
    result: { data: { id: "p1" }, error: null },
  };
  function builder() {
    const b: Record<string, unknown> = {};
    for (const m of ["insert", "update", "delete", "select", "eq"]) {
      b[m] = () => b;
    }
    b.single = () => Promise.resolve(state.result);
    b.maybeSingle = () => Promise.resolve(state.result);
    b.then = (resolve: (v: unknown) => void) => resolve(state.result);
    return b;
  }
  return { revalidatePath, state, builder };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth/helpers", () => ({
  requireAdmin: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("./slug", () => ({ ensureUniqueSlug: async () => "my-post" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => h.builder() }),
}));

import { savePost } from "./actions";

const validContent = {
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.result = { data: { id: "p1" }, error: null };
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
