import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getPostById,
  getCategoryById,
  getTagsForPost,
  getAuthorName,
  getRelatedPosts,
} from "@/lib/blog/queries";
import { BlogArticle } from "@/components/blog/BlogArticle";
import { BLOG_POST_STATUS_LABELS } from "@/types/enums";

// Admin only and never cached: a preview must always show the latest saved
// draft, and reading the auth cookie already makes the route dynamic.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview | NurseDex",
  robots: { index: false, follow: false },
};

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function BlogPreviewPage({ params }: PreviewPageProps) {
  await requireAdmin();
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  const [category, tags, authorName, related] = await Promise.all([
    getCategoryById(post.category_id),
    getTagsForPost(post.id),
    getAuthorName(post.author_id),
    getRelatedPosts(post),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-cream-light text-cream-dark border-cream-dark/30 border-b px-6 py-2 text-center text-sm font-medium">
        Preview: {BLOG_POST_STATUS_LABELS[post.status]}. Not visible to the
        public.
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <Link
          href={`/admin/blog/${post.id}/edit`}
          className="text-soft-black-light hover:text-teal-dark mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to editor
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
