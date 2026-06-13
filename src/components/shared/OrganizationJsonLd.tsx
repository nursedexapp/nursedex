import { SOCIAL_LINKS } from "@/lib/constants";

/**
 * schema.org Organization JSON-LD for the site. Listing the official social
 * profiles in sameAs lets search engines associate those accounts with the
 * brand (knowledge panel, entity disambiguation). Rendered once in the root
 * layout so it ships in the initial HTML on every page.
 */
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "NurseDex",
    url: "https://nursedex.com",
    logo: "https://nursedex.com/icon-512.png",
    sameAs: [SOCIAL_LINKS.facebook, SOCIAL_LINKS.instagram, SOCIAL_LINKS.linkedin],
  };

  return (
    <script
      type="application/ld+json"
      // Inline JSON; safe because we control all string values.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
