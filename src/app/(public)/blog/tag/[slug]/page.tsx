import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublishedPostsByTag, toListItems } from "@/lib/blog/queries";
import { BlogPostList } from "@/components/blog/BlogPostList";

export const revalidate = 60;

interface TagArchiveProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export async function generateMetadata({
  params,
  searchParams,
}: TagArchiveProps): Promise<Metadata> {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByTag(slug, page);
  if (!archive) return { title: "Tag not found | NurseDex" };

  const base = `https://nursedex.com/blog/tag/${slug}`;
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  return {
    title: `${archive.tag.name} | NurseDex Blog`,
    description: `Posts tagged ${archive.tag.name} on the NurseDex blog.`,
    alternates: { canonical },
    // A tag with no published posts is a thin page; keep it out of search.
    ...(archive.total === 0
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function TagArchivePage({
  params,
  searchParams,
}: TagArchiveProps) {
  const { slug } = await params;
  const requested = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByTag(slug, requested);
  if (!archive) notFound();

  const { tag, posts, page, totalPages, total } = archive;
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
          <p className="text-soft-black-light text-sm">Tag</p>
          <h1 className="font-heading text-soft-black mt-1 text-3xl font-semibold sm:text-4xl">
            {tag.name}
          </h1>
        </header>

        <BlogPostList
          posts={items}
          page={page}
          totalPages={totalPages}
          basePath={`/blog/tag/${slug}`}
          emptyMessage="No posts with this tag yet."
        />
      </main>
    </div>
  );
}
