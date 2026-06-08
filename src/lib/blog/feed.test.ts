// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { BlogPost } from "@/types/database";
import { buildBlogRssFeed, escapeXml } from "./feed";

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    author_id: null,
    title: "A Post",
    slug: "a-post",
    excerpt: "An excerpt.",
    content: { type: "doc", content: [] },
    cover_image_url: null,
    status: "published" as BlogPost["status"],
    publish_at: "2026-06-01T12:00:00.000Z",
    seo_title: null,
    seo_description: null,
    category_id: null,
    pinned: false,
    reading_time_minutes: 1,
    created_at: "2026-05-30T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`Tom & Jerry <"'>`)).toBe(
      "Tom &amp; Jerry &lt;&quot;&apos;&gt;",
    );
  });
});

describe("buildBlogRssFeed", () => {
  it("produces a valid RSS shell with channel metadata", () => {
    const xml = buildBlogRssFeed([], "https://nursedex.com");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>The NurseDex Blog</title>");
    expect(xml).toContain("<link>https://nursedex.com/blog</link>");
    expect(xml).toContain(
      'href="https://nursedex.com/blog/feed.xml" rel="self"',
    );
    // No items and no lastBuildDate when empty.
    expect(xml).not.toContain("<item>");
    expect(xml).not.toContain("<lastBuildDate>");
  });

  it("renders an item per post with link, guid, and RFC822 pubDate", () => {
    const xml = buildBlogRssFeed(
      [post({ title: "Hello", slug: "hello" })],
      "https://nursedex.com",
    );
    expect(xml).toContain("<title>Hello</title>");
    expect(xml).toContain("<link>https://nursedex.com/blog/hello</link>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://nursedex.com/blog/hello</guid>',
    );
    expect(xml).toContain("<pubDate>Mon, 01 Jun 2026 12:00:00 GMT</pubDate>");
    expect(xml).toContain("<description>An excerpt.</description>");
    expect(xml).toContain("<lastBuildDate>Mon, 01 Jun 2026 12:00:00 GMT</lastBuildDate>");
  });

  it("escapes special characters in titles and omits an empty description", () => {
    const xml = buildBlogRssFeed(
      [post({ title: "Cats & Dogs", excerpt: null })],
      "https://nursedex.com",
    );
    expect(xml).toContain("<title>Cats &amp; Dogs</title>");
    // Only the channel description exists; the item has none (excerpt null).
    expect((xml.match(/<description>/g) ?? []).length).toBe(1);
  });
});
