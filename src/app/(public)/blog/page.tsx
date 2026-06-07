import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { getPublishedPosts } from "@/lib/blog/queries";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Blog | NurseDex",
  description:
    "Guides and stories on home care, finding a nurse in New York, licensing, and caring for the people you love.",
  openGraph: {
    title: "NurseDex Blog",
    description:
      "Guides and stories on home care, finding a nurse in New York, and caring for the people you love.",
    type: "website",
    url: "https://nursedex.com/blog",
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

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

        {posts.length === 0 ? (
          <p className="text-soft-black-light">
            No posts yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-10">
            {posts.map((post) => (
              <article key={post.id} className="group">
                <Link href={`/blog/${post.slug}`} className="block">
                  {post.cover_image_url && (
                    <div className="border-sage-light/40 relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg border">
                      <NextImage
                        src={post.cover_image_url}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                  )}
                  <p className="text-soft-black-light text-sm">
                    {formatDate(post.publish_at)}
                  </p>
                  <h2 className="font-heading text-soft-black group-hover:text-teal-dark mt-1 text-2xl font-semibold transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-soft-black mt-2 leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
