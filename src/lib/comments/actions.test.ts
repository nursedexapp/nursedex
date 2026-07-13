// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    maybeSingle: { data: null as unknown, error: null as unknown },
    single: { data: { post_id: "post-1" } as unknown, error: null as unknown },
    insertError: null as unknown,
    // What the guarded moderation UPDATE matches (#663). A row = this caller
    // applied the transition; null = a concurrent moderator already did, and
    // already sent whatever it sends.
    moderationRow: { post_id: "post-1", author_email: "c@example.com" } as
      | Record<string, unknown>
      | null,
    moderationError: null as unknown,
  };
  const calls = { insert: [] as unknown[] };
  // setStatus's chain is update().eq(id).neq(status).select().maybeSingle(), and
  // the post lookup it then does is a READ that also ends in maybeSingle. Same
  // builder, different tables, so the terminal has to know which chain it is on.
  function builder(table?: string) {
    const b: Record<string, unknown> = {};
    let updating = false;
    b.select = () => b;
    b.eq = () => b;
    b.neq = () => b;
    b.not = () => b;
    b.is = () => b;
    b.update = () => {
      updating = true;
      return b;
    };
    b.delete = () => b;
    b.insert = (payload: unknown) => {
      calls.insert.push(payload);
      return Promise.resolve({ error: state.insertError });
    };
    b.maybeSingle = () =>
      Promise.resolve(
        table === "blog_comments" && updating
          ? { data: state.moderationRow, error: state.moderationError }
          : state.maybeSingle,
      );
    b.single = () => Promise.resolve(state.single);
    return b;
  }
  return {
    state,
    calls,
    builder,
    revalidatePath: vi.fn(),
    sendComment: vi.fn(),
    sendApproved: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/email/send", () => ({
  sendCommentSubmittedEmail: h.sendComment,
  sendCommentApprovedEmail: h.sendApproved,
}));
vi.mock("@/lib/auth/helpers", () => ({
  // Happy path only: this stubs the guard so the logic PAST it can be
  // exercised. The refused direction (wrong role / not signed in, and no
  // write) is covered for real in src/lib/admin/authz-boundary.test.ts,
  // which runs the actual guard.
  // eslint-disable-next-line local/no-mocked-auth-guard -- see above
  requireAdmin: async () => ({ id: "admin-1" }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => h.builder(table),
  }),
}));

import {
  submitComment,
  approveComment,
  rejectComment,
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
  h.state.moderationRow = {
    post_id: "post-1",
    author_email: "c@example.com",
  };
  h.state.moderationError = null;
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
  it("approveComment revalidates the post page and emails the commenter", async () => {
    h.state.moderationRow = {
      post_id: "post-9",
      author_email: "reader@x.com",
    };
    h.state.maybeSingle = {
      data: { slug: "my-post", title: "My Post" },
      error: null,
    };
    const res = await approveComment("c1");
    expect(res.success).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/my-post");
    expect(h.sendApproved).toHaveBeenCalledWith({
      to: "reader@x.com",
      postTitle: "My Post",
      slug: "my-post",
    });
  });

  it("rejectComment does not email the commenter", async () => {
    h.state.moderationRow = {
      post_id: "post-9",
      author_email: "reader@x.com",
    };
    h.state.maybeSingle = {
      data: { slug: "my-post", title: "My Post" },
      error: null,
    };
    const res = await rejectComment("c1");
    expect(res.success).toBe(true);
    expect(h.sendApproved).not.toHaveBeenCalled();
  });

  it("sends no second email when a concurrent moderator already approved it", async () => {
    // #663. The moderation UPDATE carried no precondition at all, so a
    // double-clicked Approve wrote twice and mailed the commenter twice. The
    // .neq("status", status) guard means the second one matches no row.
    h.state.moderationRow = null;
    h.state.maybeSingle = {
      data: { slug: "my-post", title: "My Post" },
      error: null,
    };

    const res = await approveComment("c1");

    expect(res.success).toBe(true);
    expect(h.sendApproved).not.toHaveBeenCalled();
  });

  it("deleteComment revalidates the post page", async () => {
    h.state.single = { data: { post_id: "post-9" }, error: null };
    h.state.maybeSingle = {
      data: { slug: "my-post", title: "My Post" },
      error: null,
    };
    const res = await deleteComment("c1");
    expect(res.success).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/my-post");
  });
});
