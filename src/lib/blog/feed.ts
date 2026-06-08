import type { BlogPost } from "@/types/database";

const BASE_URL = "https://nursedex.com";
const FEED_TITLE = "The NurseDex Blog";
const FEED_DESCRIPTION =
  "Guides and stories on home care, finding trusted nurses, and caring for the people you love.";

/** Escape the five XML special characters for safe inclusion in element text. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pubDate(post: BlogPost): string {
  const iso = post.publish_at || post.created_at;
  return new Date(iso).toUTCString();
}

/**
 * Build an RSS 2.0 feed from published posts (expected newest first).
 * Pure: takes the posts and a base URL and returns the XML string, so it
 * is unit testable without a request. Item descriptions use the excerpt;
 * a full-content feed would require serializing the Tiptap body to HTML.
 */
export function buildBlogRssFeed(
  posts: BlogPost[],
  baseUrl: string = BASE_URL,
): string {
  const items = posts.map((post) => {
    const url = `${baseUrl}/blog/${post.slug}`;
    const lines = [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${pubDate(post)}</pubDate>`,
    ];
    if (post.excerpt) {
      lines.push(`      <description>${escapeXml(post.excerpt)}</description>`);
    }
    lines.push("    </item>");
    return lines.join("\n");
  });

  const channel = [
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${baseUrl}/blog</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en-us</language>",
    `    <atom:link href="${baseUrl}/blog/feed.xml" rel="self" type="application/rss+xml" />`,
  ];
  // lastBuildDate is derived from the newest post so the output stays
  // deterministic (no wall-clock read).
  if (posts.length > 0) {
    channel.push(`    <lastBuildDate>${pubDate(posts[0])}</lastBuildDate>`);
  }
  channel.push(...items, "  </channel>");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    ...channel,
    "</rss>",
    "",
  ].join("\n");
}
