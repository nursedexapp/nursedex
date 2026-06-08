import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getPublishedPostBySlug,
  getCategoryById,
  getTagsForPost,
  getAuthorName,
  getRelatedPosts,
} from "@/lib/blog/queries";
import { ArticleJsonLd } from "@/components/shared/ArticleJsonLd";
import { BlogArticle } from "@/components/blog/BlogArticle";

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

        <BlogArticle
          post={post}
          category={category}
          tags={tags}
          authorName={authorName}
          related={related}
        />
      </main>
    </div>
  );
}
