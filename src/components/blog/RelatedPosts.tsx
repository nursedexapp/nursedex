import Link from "next/link";
import NextImage from "next/image";
import type { BlogPostListItem } from "@/types/database";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RelatedPosts({ posts }: { posts: BlogPostListItem[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="border-sage-light/40 mt-12 border-t pt-8">
      <h2 className="font-heading text-soft-black mb-6 text-xl font-semibold">
        Read next
      </h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.slug}`}
            className="group block"
          >
            {post.cover_image_url && (
              <div className="border-sage-light/40 relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-md border">
                <NextImage
                  src={post.cover_image_url}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 240px"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
            )}
            {post.categoryName && (
              <p className="text-teal-dark text-xs font-medium">
                {post.categoryName}
              </p>
            )}
            <h3 className="font-heading text-soft-black group-hover:text-teal-dark mt-0.5 text-base leading-snug font-semibold transition-colors">
              {post.title}
            </h3>
            <p className="text-soft-black-light mt-1 text-xs">
              {formatDate(post.publish_at)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
