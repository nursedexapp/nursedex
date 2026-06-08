import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPublishedPostsPage,
  searchPublishedPosts,
  toListItems,
} from "@/lib/blog/queries";
import { BlogPostList } from "@/components/blog/BlogPostList";
import { BlogSearch } from "@/components/blog/BlogSearch";
import { NewsletterCta } from "@/components/blog/NewsletterCta";

export const revalidate = 60;

const BASE = "https://nursedex.com/blog";
const DESCRIPTION =
  "Guides and stories on home care, finding a nurse in New York, licensing, and caring for the people you love.";

interface BlogIndexPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export async function generateMetadata({
  searchParams,
}: BlogIndexPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q?.trim();
  if (query) {
    // Search result pages should not be indexed.
    return {
      title: `Search: ${query} | NurseDex Blog`,
      robots: { index: false, follow: true },
    };
  }

  const page = parsePage(params.page);
  const canonical = page > 1 ? `${BASE}?page=${page}` : BASE;
  return {
    title: page > 1 ? `Blog (Page ${page}) | NurseDex` : "Blog | NurseDex",
    description: DESCRIPTION,
    alternates: {
      canonical,
      types: { "application/rss+xml": `${BASE}/feed.xml` },
    },
    openGraph: {
      title: "NurseDex Blog",
      description: DESCRIPTION,
      type: "website",
      url: canonical,
    },
  };
}

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const requested = parsePage(params.page);

  const result = query
    ? await searchPublishedPosts(query, requested)
    : await getPublishedPostsPage(requested);
  const { posts, page, totalPages, total } = result;

  // Out of range paged URLs 404 rather than render an empty list.
  if (total > 0 && requested > totalPages) notFound();

  const items = await toListItems(posts);
  const basePath = query ? `/blog?q=${encodeURIComponent(query)}` : "/blog";

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        {/* rel prev/next for paginated index pages. React 19 hoists these
            <link> tags into <head>. Not emitted on search result pages. */}
        {!query && page > 1 && (
          <link
            rel="prev"
            href={page - 1 <= 1 ? BASE : `${BASE}?page=${page - 1}`}
          />
        )}
        {!query && page < totalPages && (
          <link rel="next" href={`${BASE}?page=${page + 1}`} />
        )}

        <header className="mb-10">
          <h1 className="font-heading text-soft-black text-3xl font-semibold sm:text-4xl">
            The NurseDex Blog
          </h1>
          <p className="text-soft-black-light mt-3 text-lg">
            Guides and stories on home care, finding trusted nurses, and caring
            for the people you love.
          </p>
          <div className="mt-6">
            <BlogSearch initialQuery={query} />
          </div>
          {query && (
            <p className="text-soft-black-light mt-4 text-sm">
              {total} result{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </p>
          )}
        </header>

        <BlogPostList
          posts={items}
          page={page}
          totalPages={totalPages}
          basePath={basePath}
          emptyMessage={
            query
              ? "No posts match your search."
              : "No posts yet. Check back soon."
          }
        />

        {!query && (
          <div className="mt-16">
            <NewsletterCta source="blog_index" />
          </div>
        )}
      </main>
    </div>
  );
}
