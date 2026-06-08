import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublishedPostsByAuthor, toListItems } from "@/lib/blog/queries";
import { BlogPostList } from "@/components/blog/BlogPostList";

export const revalidate = 60;

interface AuthorArchiveProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

function displayName(name: string | null): string {
  return name || "The NurseDex team";
}

export async function generateMetadata({
  params,
  searchParams,
}: AuthorArchiveProps): Promise<Metadata> {
  const { id } = await params;
  const page = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByAuthor(id, page);
  if (!archive) return { title: "Author not found | NurseDex" };

  const name = displayName(archive.authorName);
  const base = `https://nursedex.com/blog/author/${id}`;
  return {
    title: `Posts by ${name} | NurseDex Blog`,
    description: `Articles written by ${name} on the NurseDex blog.`,
    alternates: { canonical: page > 1 ? `${base}?page=${page}` : base },
  };
}

export default async function AuthorArchivePage({
  params,
  searchParams,
}: AuthorArchiveProps) {
  const { id } = await params;
  const requested = parsePage((await searchParams).page);
  const archive = await getPublishedPostsByAuthor(id, requested);
  if (!archive) notFound();

  const { authorName, posts, page, totalPages, total } = archive;
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
          <p className="text-soft-black-light text-sm">Author</p>
          <h1 className="font-heading text-soft-black mt-1 text-3xl font-semibold sm:text-4xl">
            {displayName(authorName)}
          </h1>
        </header>

        <BlogPostList
          posts={items}
          page={page}
          totalPages={totalPages}
          basePath={`/blog/author/${id}`}
        />
      </main>
    </div>
  );
}
