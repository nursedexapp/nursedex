import type { Breadcrumb } from "@/lib/blog/breadcrumbs";

/**
 * schema.org BreadcrumbList JSON-LD. Helps search engines show the page's
 * place in the site hierarchy. Values are controlled by us, so inlining
 * the JSON is safe.
 */
export function BreadcrumbJsonLd({ items }: { items: Breadcrumb[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
