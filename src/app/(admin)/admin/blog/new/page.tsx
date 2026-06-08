import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostEditorForm } from "@/components/blog/PostEditorForm";
import { getCategories, getTags } from "@/lib/blog/queries";

export const metadata: Metadata = {
  title: "New post | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function NewBlogPostPage() {
  const [categories, allTags] = await Promise.all([getCategories(), getTags()]);
  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <Link
        href="/admin/blog"
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to posts
      </Link>
      <h1 className="font-heading text-soft-black mb-6 text-2xl font-semibold">
        New post
      </h1>
      <PostEditorForm
        post={null}
        categories={categories}
        allTags={allTags}
        postTags={[]}
      />
    </div>
  );
}
