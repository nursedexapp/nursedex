import type { BlogPost } from "@/types/database";

const BASE_URL = "https://nursedex.com";

/**
 * schema.org BlogPosting JSON-LD for a single post. Helps search engines
 * and AI answer engines understand the article (headline, dates, image,
 * publisher) and is eligible for richer results. All values come from the
 * post record, which we control, so inlining the JSON is safe.
 */
export function ArticleJsonLd({ post }: { post: BlogPost }) {
  const url = `${BASE_URL}/blog/${post.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || undefined,
    image: post.cover_image_url || `${BASE_URL}/icon-512.png`,
    datePublished: post.publish_at || post.created_at,
    dateModified: post.updated_at,
    author: { "@type": "Organization", name: "NurseDex", url: BASE_URL },
    publisher: {
      "@type": "Organization",
      name: "NurseDex",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/icon-512.png`,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
