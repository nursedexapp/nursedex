// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    maybeSingle: { data: null as unknown, error: null as unknown },
    single: { data: { post_id: "post-1" } as unknown, error: null as unknown },
    insertError: null as unknown,
  };
  const calls = { insert: [] as unknown[] };
  function builder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.update = () => b;
    b.delete = () => b;
    b.insert = (payload: unknown) => {
      calls.insert.push(payload);
      return Promise.resolve({ error: state.insertError });
    };
    b.maybeSingle = () => Promise.resolve(state.maybeSingle);
    b.single = () => Promise.resolve(state.single);
    return b;
  }
  return {
    state,
    calls,
    builder,
    revalidatePath: vi.fn(),
    sendComment: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/email/send", () => ({
  sendCommentSubmittedEmail: h.sendComment,
}));
vi.mock("@/lib/auth/helpers", () => ({
  requireAdmin: async () => ({ id: "admin-1" }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => h.builder() }),
}));

import {
  submitComment,
  approveComment,
  deleteComment,
} from "./actions";

const POST_ID = "00000000-0000-4000-8000-000000000001";
const valid = {
  post_id: POST_ID,
  author_name: "Reader",
  author_email: "reader@example.com",
  body: "Great post, thanks!",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.maybeSingle = {
    data: { status: "published", title: "My Post" },
    error: null,
  };
  h.state.single = { data: { post_id: "post-1" }, error: null };
  h.state.insertError = null;
  h.calls.insert = [];
});

describe("submitComment", () => {
  it("stores a valid comment as pending and notifies admins", async () => {
    const res = await submitComment(valid);
    expect(res.success).toBe(true);
    expect(h.calls.insert).toHaveLength(1);
    expect(h.calls.insert[0]).toMatchObject({ status: "pending", post_id: POST_ID });
    expect(h.sendComment).toHaveBeenCalledWith({
      postTitle: "My Post",
      authorName: "Reader",
      body: "Great post, thanks!",
    });
  });

  it("rejects an invalid email with field errors and stores nothing", async () => {
    const res = await submitComment({ ...valid, author_email: "nope" });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.author_email).toBeTruthy();
    expect(h.calls.insert).toHaveLength(0);
  });

  it("silently drops a filled honeypot", async () => {
    const res = await submitComment({ ...valid, website: "spam" });
    expect(res.success).toBe(true);
    expect(h.calls.insert).toHaveLength(0);
  });

  it("refuses to store a comment on a non-published post", async () => {
    h.state.maybeSingle = { data: { status: "draft" }, error: null };
    const res = await submitComment(valid);
    expect(res.success).toBe(false);
    expect(h.calls.insert).toHaveLength(0);
  });
});

describe("moderation", () => {
  it("approveComment revalidates the post page", async () => {
    h.state.single = { data: { post_id: "post-9" }, error: null };
    h.state.maybeSingle = { data: { slug: "my-post" }, error: null };
    const res = await approveComment("c1");
    expect(res.success).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/my-post");
  });

  it("deleteComment revalidates the post page", async () => {
    h.state.single = { data: { post_id: "post-9" }, error: null };
    h.state.maybeSingle = { data: { slug: "my-post" }, error: null };
    const res = await deleteComment("c1");
    expect(res.success).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/my-post");
  });
});
