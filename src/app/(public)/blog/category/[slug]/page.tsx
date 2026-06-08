import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublishedPostsByCategory, toListItems } from "@/lib/blog/queries";
import { BlogPostList } from "@/components/blog/BlogPostList";

export const revalidate = 60;

interface CategoryArchiveProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryArchiveProps): Promise<Metadata> {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByCategory(slug, page);
  if (!archive) return { title: "Category not found | NurseDex" };

  const base = `https://nursedex.com/blog/category/${slug}`;
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  return {
    title: `${archive.category.name} | NurseDex Blog`,
    description: `Posts in ${archive.category.name} on the NurseDex blog.`,
    alternates: { canonical },
    // A category with no published posts is a thin page; keep it out of search.
    ...(archive.total === 0
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function CategoryArchivePage({
  params,
  searchParams,
}: CategoryArchiveProps) {
  const { slug } = await params;
  const requested = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByCategory(slug, requested);
  if (!archive) notFound();

  const { category, posts, page, totalPages, total } = archive;
  if (total > 0 && requested > totalPages) notFound();

  const items = await toListItems(posts);

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <Link
          href="/blog"
          className="text-soft-black-light hover:text-teal-dark mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          All posts
        </Link>

        <header className="mb-10">
          <p className="text-soft-black-light text-sm">Category</p>
          <h1 className="font-heading text-soft-black mt-1 text-3xl font-semibold sm:text-4xl">
            {category.name}
          </h1>
        </header>

        <BlogPostList
          posts={items}
          page={page}
          totalPages={totalPages}
          basePath={`/blog/category/${slug}`}
          emptyMessage="No posts in this category yet."
        />
      </main>
    </div>
  );
}
