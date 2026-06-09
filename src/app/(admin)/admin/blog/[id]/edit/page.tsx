import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { PostEditorForm } from "@/components/blog/PostEditorForm";
import {
  getPostById,
  getCategories,
  getTags,
  getTagsForPost,
} from "@/lib/blog/queries";

export const metadata: Metadata = {
  title: "Edit post | NurseDex Admin",
  robots: { index: false, follow: false },
};

interface EditBlogPostPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBlogPostPage({
  params,
}: EditBlogPostPageProps) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  const [categories, allTags, postTags] = await Promise.all([
    getCategories(),
    getTags(),
    getTagsForPost(post.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <Link
        href="/admin/blog"
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to posts
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Edit post
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/blog/${id}/revisions`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <History className="size-4" />
            History
          </Link>
        </div>
      </div>
      <PostEditorForm
        post={post}
        categories={categories}
        allTags={allTags}
        postTags={postTags}
      />
    </div>
  );
}
