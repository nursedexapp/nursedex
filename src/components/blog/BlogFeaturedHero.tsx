import Link from "next/link";
import NextImage from "next/image";
import type { BlogPostListItem } from "@/types/database";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A larger hero card for the top pinned post on the blog index, so a
 * featured post reads as deliberately featured rather than just first.
 */
export function BlogFeaturedHero({ post }: { post: BlogPostListItem }) {
  return (
    <article className="group mb-12">
      <Link href={`/blog/${post.slug}`} className="block">
        {post.cover_image_url && (
          <div className="border-sage-light/40 relative mb-5 aspect-[16/9] w-full overflow-hidden rounded-xl border">
            <NextImage
              src={post.cover_image_url}
              alt={post.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <span className="bg-cream-light text-cream-dark absolute top-4 left-4 rounded-full px-3 py-1 text-xs font-semibold">
              Featured
            </span>
          </div>
        )}
        <div className="text-soft-black-light flex flex-wrap items-center gap-2 text-sm">
          <span>
            {formatDate(post.publish_at)} · {post.reading_time_minutes} min read
          </span>
          {post.categoryName && post.categorySlug && (
            <span className="bg-sage/15 text-teal-dark rounded-full px-2 py-0.5 text-xs font-medium">
              {post.categoryName}
            </span>
          )}
        </div>
        <h2 className="font-heading text-soft-black group-hover:text-teal-dark mt-2 text-3xl font-semibold transition-colors sm:text-4xl">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-soft-black mt-3 text-lg leading-relaxed">
            {post.excerpt}
          </p>
        )}
      </Link>
    </article>
  );
}
