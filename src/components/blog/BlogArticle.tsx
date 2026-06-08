import Link from "next/link";
import NextImage from "next/image";
import { PostContent } from "@/lib/blog/render";
import { readingTimeMinutes } from "@/lib/blog/text";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import type {
  BlogCategory,
  BlogPost,
  BlogPostListItem,
  BlogTag,
} from "@/types/database";

interface BlogArticleProps {
  post: BlogPost;
  category: BlogCategory | null;
  tags: BlogTag[];
  authorName: string | null;
  related: BlogPostListItem[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The visual article body shared by the public post page and the admin
 * draft preview, so a preview renders exactly as the published page will.
 */
export function BlogArticle({
  post,
  category,
  tags,
  authorName,
  related,
}: BlogArticleProps) {
  return (
    <>
      <header className="mb-8">
        <div className="text-soft-black-light flex items-center gap-2 text-sm">
          <span>
            {formatDate(post.publish_at)}
            {authorName ? <> · By {authorName}</> : null} ·{" "}
            {readingTimeMinutes(post.content)} min read
          </span>
          {category && (
            <Link
              href={`/blog/category/${category.slug}`}
              className="bg-sage/15 text-teal-dark hover:bg-sage/25 rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
            >
              {category.name}
            </Link>
          )}
        </div>
        <h1 className="font-heading text-soft-black mt-2 text-3xl font-semibold sm:text-4xl">
          {post.title}
        </h1>
      </header>

      {post.cover_image_url && (
        <div className="border-sage-light/40 relative mb-8 aspect-[16/9] w-full overflow-hidden rounded-lg border">
          <NextImage
            src={post.cover_image_url}
            alt={post.title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      <article className="prose prose-headings:font-heading prose-headings:text-soft-black prose-a:text-teal-dark prose-img:rounded-lg max-w-none">
        <PostContent doc={post.content} />
      </article>

      {tags.length > 0 && (
        <div className="border-sage-light/40 mt-10 flex flex-wrap gap-2 border-t pt-6">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/blog/tag/${tag.slug}`}
              className="bg-sage/15 text-soft-black hover:bg-sage/25 rounded-full px-3 py-1 text-sm transition-colors"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      )}

      <RelatedPosts posts={related} />
    </>
  );
}
