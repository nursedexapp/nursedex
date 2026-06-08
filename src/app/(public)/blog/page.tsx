import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPostsPage, toListItems } from "@/lib/blog/queries";
import { BlogPostList } from "@/components/blog/BlogPostList";

export const revalidate = 60;

const BASE = "https://nursedex.com/blog";
const DESCRIPTION =
  "Guides and stories on home care, finding a nurse in New York, licensing, and caring for the people you love.";

interface BlogIndexPageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export async function generateMetadata({
  searchParams,
}: BlogIndexPageProps): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  const canonical = page > 1 ? `${BASE}?page=${page}` : BASE;
  return {
    title: page > 1 ? `Blog (Page ${page}) | NurseDex` : "Blog | NurseDex",
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      title: "NurseDex Blog",
      description: DESCRIPTION,
      type: "website",
      url: canonical,
    },
  };
}

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  const requested = parsePage((await searchParams).page);
  const { posts, page, totalPages, total } =
    await getPublishedPostsPage(requested);

  // Out of range paged URLs 404 rather than render an empty list (keeps
  // crawlers off thin pages). Page 1 with no posts shows the empty state.
  if (total > 0 && requested > totalPages) notFound();

  const items = await toListItems(posts);

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="font-heading text-soft-black text-3xl font-semibold sm:text-4xl">
            The NurseDex Blog
          </h1>
          <p className="text-soft-black-light mt-3 text-lg">
            Guides and stories on home care, finding trusted nurses, and caring
            for the people you love.
          </p>
        </header>

        <BlogPostList
          posts={items}
          page={page}
          totalPages={totalPages}
          basePath="/blog"
        />
      </main>
    </div>
  );
}
