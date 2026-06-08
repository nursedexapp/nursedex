// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { BlogPost } from "@/types/database";
import { selectRelatedPosts } from "./related";

function post(id: string, overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id,
    author_id: null,
    title: `Post ${id}`,
    slug: id,
    excerpt: null,
    content: { type: "doc", content: [] },
    cover_image_url: null,
    status: "published" as BlogPost["status"],
    publish_at: "2026-06-01T00:00:00.000Z",
    seo_title: null,
    seo_description: null,
    category_id: null,
    pinned: false,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectRelatedPosts", () => {
  const self = "self";

  it("ranks posts with more shared tags first", () => {
    // b appears twice (2 shared tags), a once.
    const matches = [post("a"), post("b"), post("b")];
    const result = selectRelatedPosts(matches, [], {
      selfId: self,
      categoryId: null,
      limit: 3,
    });
    expect(result.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("excludes the post itself and de-dupes", () => {
    const matches = [post(self), post(self), post("a"), post("a")];
    const result = selectRelatedPosts(matches, [], {
      selfId: self,
      categoryId: null,
      limit: 3,
    });
    expect(result.map((p) => p.id)).toEqual(["a"]);
  });

  it("fills remaining slots from recent posts, same category first", () => {
    const matches = [post("a")];
    const recent = [
      post("x", { category_id: "other" }),
      post("y", { category_id: "cat1" }),
      post("a", { category_id: "cat1" }), // already chosen via tags
    ];
    const result = selectRelatedPosts(matches, recent, {
      selfId: self,
      categoryId: "cat1",
      limit: 3,
    });
    // a (tags), then y (same category), then x (other)
    expect(result.map((p) => p.id)).toEqual(["a", "y", "x"]);
  });

  it("respects the limit", () => {
    const recent = [post("a"), post("b"), post("c"), post("d")];
    const result = selectRelatedPosts([], recent, {
      selfId: self,
      categoryId: null,
      limit: 2,
    });
    expect(result).toHaveLength(2);
  });
});
