import { getPublishedPostsPage } from "@/lib/blog/queries";
import { buildBlogRssFeed } from "@/lib/blog/feed";

// A static segment named "feed.xml" takes precedence over the sibling
// [slug] route, so /blog/feed.xml serves this feed rather than a post.
export const revalidate = 3600;

const FEED_LIMIT = 20;

export async function GET() {
  const { posts } = await getPublishedPostsPage(1, FEED_LIMIT);
  const xml = buildBlogRssFeed(posts);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
