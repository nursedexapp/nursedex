// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const state = {
    redirect: null as unknown, // row from blog_slug_redirects, or null
    post: null as unknown, // row from blog_posts (published target), or null
  };
  function from(table: string) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = () =>
      Promise.resolve({
        data: table === "blog_slug_redirects" ? state.redirect : state.post,
      });
    return b;
  }
  return { state, from };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: h.from }),
}));

import { getLiveBlogSlugRedirect } from "./redirects";

beforeEach(() => {
  h.state.redirect = null;
  h.state.post = null;
});

describe("getLiveBlogSlugRedirect", () => {
  it("returns null when there is no redirect for the slug", async () => {
    expect(await getLiveBlogSlugRedirect("old")).toBeNull();
  });

  it("returns the target when it resolves to a published post", async () => {
    h.state.redirect = { new_slug: "new-post" };
    h.state.post = { slug: "new-post" };
    expect(await getLiveBlogSlugRedirect("old")).toBe("new-post");
  });

  it("returns null when the target no longer resolves (unpublished/removed)", async () => {
    h.state.redirect = { new_slug: "gone" };
    h.state.post = null;
    expect(await getLiveBlogSlugRedirect("old")).toBeNull();
  });
});
