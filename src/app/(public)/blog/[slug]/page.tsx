import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getPublishedPostBySlug,
  getCategoryById,
  getTagsForPost,
  getAuthorName,
  getRelatedPosts,
} from "@/lib/blog/queries";
import { PostContent } from "@/lib/blog/render";
import { ArticleJsonLd } from "@/components/shared/ArticleJsonLd";
import { RelatedPosts } from "@/components/blog/RelatedPosts";

export const revalidate = 60;

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return { title: "Post not found | NurseDex" };

  const description = post.seo_description || post.excerpt || undefined;
  const url = `https://nursedex.com/blog/${post.slug}`;
  return {
    title: `${post.seo_title || post.title} | NurseDex`,
    description,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": "https://nursedex.com/blog/feed.xml" },
    },
    openGraph: {
      title: post.seo_title || post.title,
      description,
      type: "article",
      url,
      publishedTime: post.publish_at ?? undefined,
      modifiedTime: post.updated_at,
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

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const [category, tags, authorName, related] = await Promise.all([
    getCategoryById(post.category_id),
    getTagsForPost(post.id),
    getAuthorName(post.author_id),
    getRelatedPosts(post),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <ArticleJsonLd post={post} authorName={authorName} />

        <Link
          href="/blog"
          className="text-soft-black-light hover:text-teal-dark mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          All posts
        </Link>

        <header className="mb-8">
          <div className="text-soft-black-light flex items-center gap-2 text-sm">
            <span>
              {formatDate(post.publish_at)}
              {authorName ? <> · By {authorName}</> : null}
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
      </main>
    </div>
  );
}
