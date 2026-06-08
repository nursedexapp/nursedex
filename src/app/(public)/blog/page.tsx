import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPublishedPostsPage } from "@/lib/blog/queries";

export const revalidate = 60;

const BASE = "https://nursedex.com/blog";
const DESCRIPTION =
  "Guides and stories on home care, finding a nurse in New York, licensing, and caring for the people you love.";

interface BlogIndexPageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export async function generateMetadata({
  searchParams,
}: BlogIndexPageProps): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function pageHref(page: number): string {
  return page <= 1 ? "/blog" : `/blog?page=${page}`;
}

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  const requested = parsePage((await searchParams).page);
  const { posts, page, totalPages, total } =
    await getPublishedPostsPage(requested);

  // Out of range paged URLs 404 rather than render an empty list (keeps
  // crawlers off thin pages). Page 1 with no posts shows the empty state.
  if (total > 0 && requested > totalPages) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="font-heading text-soft-black text-3xl font-semibold sm:text-4xl">
            The NurseDex Blog
          </h1>
          <p className="text-soft-black-light mt-3 text-lg">
            Guides and stories on home care, finding trusted nurses, and caring
            for the people you love.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-soft-black-light">No posts yet. Check back soon.</p>
        ) : (
          <div className="space-y-10">
            {posts.map((post) => (
              <article key={post.id} className="group">
                <Link href={`/blog/${post.slug}`} className="block">
                  {post.cover_image_url && (
                    <div className="border-sage-light/40 relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg border">
                      <NextImage
                        src={post.cover_image_url}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                  )}
                  <p className="text-soft-black-light text-sm">
                    {formatDate(post.publish_at)}
                  </p>
                  <h2 className="font-heading text-soft-black group-hover:text-teal-dark mt-1 text-2xl font-semibold transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-soft-black mt-2 leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}
                </Link>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            className="border-sage-light/40 mt-12 flex items-center justify-between border-t pt-6"
            aria-label="Blog pages"
          >
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                rel="prev"
                className="text-soft-black hover:text-teal-dark inline-flex items-center gap-1 text-sm font-medium"
              >
                <ChevronLeft className="size-4" />
                Newer posts
              </Link>
            ) : (
              <span />
            )}

            <span className="text-soft-black-light text-sm">
              Page {page} of {totalPages}
            </span>

            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                rel="next"
                className="text-soft-black hover:text-teal-dark inline-flex items-center gap-1 text-sm font-medium"
              >
                Older posts
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
