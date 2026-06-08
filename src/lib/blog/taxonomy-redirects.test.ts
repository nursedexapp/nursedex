// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const state = {
    redirect: null as unknown, // blog_taxonomy_redirects row
    target: null as unknown, // category/tag row at the new slug
  };
  function from(table: string) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = () =>
      Promise.resolve({
        data:
          table === "blog_taxonomy_redirects" ? state.redirect : state.target,
      });
    return b;
  }
  return { state, from };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: h.from }),
}));

import { getLiveTaxonomyRedirect } from "./taxonomy-redirects";

beforeEach(() => {
  h.state.redirect = null;
  h.state.target = null;
});

describe("getLiveTaxonomyRedirect", () => {
  it("returns null when there is no redirect", async () => {
    expect(await getLiveTaxonomyRedirect("category", "old")).toBeNull();
  });

  it("returns the new slug when the target still resolves", async () => {
    h.state.redirect = { new_slug: "new-cat" };
    h.state.target = { slug: "new-cat" };
    expect(await getLiveTaxonomyRedirect("category", "old")).toBe("new-cat");
  });

  it("returns null when the redirect target no longer resolves", async () => {
    h.state.redirect = { new_slug: "gone" };
    h.state.target = null;
    expect(await getLiveTaxonomyRedirect("tag", "old")).toBeNull();
  });
});
