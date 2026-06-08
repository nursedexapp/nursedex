// @vitest-environment node
import { describe, it, expect } from "vitest";
import { diffRevisions } from "./revision-diff";
import type { BlogPostRevision, TiptapDoc } from "@/types/database";

function doc(text: string): TiptapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function rev(over: Partial<BlogPostRevision>): BlogPostRevision {
  return {
    id: "r",
    post_id: "p",
    title: "T",
    excerpt: null,
    content: doc(""),
    created_by: null,
    created_at: "",
    ...over,
  };
}

describe("diffRevisions", () => {
  it("flags added and removed words in the title and body", () => {
    const from = rev({ title: "Home Care Tips", content: doc("alpha beta") });
    const to = rev({ title: "Home Care Guide", content: doc("alpha gamma") });
    const d = diffRevisions(from, to);

    expect(d.title.some((p) => p.removed && p.value.includes("Tips"))).toBe(true);
    expect(d.title.some((p) => p.added && p.value.includes("Guide"))).toBe(true);
    expect(d.body.some((p) => p.removed && p.value.includes("beta"))).toBe(true);
    expect(d.body.some((p) => p.added && p.value.includes("gamma"))).toBe(true);
  });

  it("produces no add/remove parts for identical revisions", () => {
    const a = rev({ title: "Same", content: doc("same body") });
    const d = diffRevisions(a, rev({ title: "Same", content: doc("same body") }));
    expect(d.title.every((p) => !p.added && !p.removed)).toBe(true);
    expect(d.body.every((p) => !p.added && !p.removed)).toBe(true);
  });
});
