import Link from "next/link";
import NextImage from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BlogPostListItem } from "@/types/database";

interface BlogPostListProps {
  posts: BlogPostListItem[];
  page: number;
  totalPages: number;
  /** Path the pagination links hang off, e.g. /blog or /blog/tag/foo. */
  basePath: string;
  emptyMessage?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function pageHref(basePath: string, page: number): string {
  if (page <= 1) return basePath;
  // basePath may already carry a query (e.g. a search), so pick the right
  // separator rather than always appending "?page=".
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}page=${page}`;
}

export function BlogPostList({
  posts,
  page,
  totalPages,
  basePath,
  emptyMessage = "No posts yet. Check back soon.",
}: BlogPostListProps) {
  if (posts.length === 0) {
    return <p className="text-soft-black-light">{emptyMessage}</p>;
  }

  return (
    <>
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
              <div className="text-soft-black-light flex items-center gap-2 text-sm">
                <span>{formatDate(post.publish_at)}</span>
                {post.categoryName && post.categorySlug && (
                  <span className="bg-sage/15 text-teal-dark rounded-full px-2 py-0.5 text-xs font-medium">
                    {post.categoryName}
                  </span>
                )}
              </div>
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

      {totalPages > 1 && (
        <nav
          className="border-sage-light/40 mt-12 flex items-center justify-between border-t pt-6"
          aria-label="Blog pages"
        >
          {page > 1 ? (
            <Link
              href={pageHref(basePath, page - 1)}
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
              href={pageHref(basePath, page + 1)}
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
    </>
  );
}
