// @vitest-environment node
import { describe, it, expect } from "vitest";
import { blogPostSchema, contentInputSchema } from "./blog";

const docWithAttrs = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Hi" }],
    },
    { type: "embed", attrs: { url: "https://youtube.com/watch?v=abc" } },
    { type: "image", attrs: { src: "/x.jpg", alt: "a", align: "left" } },
  ],
};

describe("contentInputSchema", () => {
  it("parses a JSON string and preserves node attrs", () => {
    const parsed = contentInputSchema.parse(JSON.stringify(docWithAttrs));
    const json = JSON.stringify(parsed);
    expect(json).toContain('"level":3');
    expect(json).toContain('"url":"https://youtube.com/watch?v=abc"');
    expect(json).toContain('"src":"/x.jpg"');
  });

  it("still accepts a plain object", () => {
    const parsed = contentInputSchema.parse(docWithAttrs);
    expect(JSON.stringify(parsed)).toContain('"level":3');
  });

  it("rejects an unparseable string", () => {
    expect(contentInputSchema.safeParse("not json {").success).toBe(false);
  });
});

describe("blogPostSchema with stringified content", () => {
  it("keeps embed url through the post schema", () => {
    const res = blogPostSchema.safeParse({
      intent: "publish",
      title: "T",
      content: JSON.stringify(docWithAttrs),
      tags: [],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(JSON.stringify(res.data.content)).toContain(
        '"url":"https://youtube.com/watch?v=abc"',
      );
    }
  });
});
