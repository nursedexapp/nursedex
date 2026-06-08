import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTaxonomyForAdmin } from "@/lib/blog/queries";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export const metadata: Metadata = {
  title: "Categories & tags | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function TaxonomyPage() {
  const { categories, tags } = await getTaxonomyForAdmin();

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <Link
        href="/admin/blog"
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to posts
      </Link>
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Categories &amp; tags
      </h1>
      <p className="text-soft-black-light mt-1 mb-6 text-sm">
        Rename, merge, or delete taxonomy. New ones are created from the post
        editor. Deleting a category leaves its posts uncategorized; deleting a
        tag removes it from its posts.
      </p>

      <TaxonomyManager categories={categories} tags={tags} />
    </div>
  );
}
