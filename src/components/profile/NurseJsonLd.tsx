interface NurseJsonLdProps {
  firstName: string;
  lastName: string;
  credentialLabel: string;
  slug: string;
  bio: string | null;
  photoUrl: string | null;
  avgRating: number | null;
  reviewCount: number;
}

/**
 * schema.org Person + Review aggregate JSON-LD for the public nurse
 * profile. Rendered as an inline script so it lands in the initial
 * HTML response and indexes cleanly.
 *
 * AggregateRating is only emitted when there's at least one approved
 * review; emitting it with reviewCount=0 produces a Search Console
 * warning.
 */
export function NurseJsonLd({
  firstName,
  lastName,
  credentialLabel,
  slug,
  bio,
  photoUrl,
  avgRating,
  reviewCount,
}: NurseJsonLdProps) {
  const profileUrl = `https://nursedex.com/nurses/${slug}`;
  const fullName = `${firstName} ${lastName}`.trim();

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: fullName,
    jobTitle: credentialLabel,
    url: profileUrl,
    worksFor: {
      "@type": "Organization",
      name: "NurseDex",
      url: "https://nursedex.com",
    },
  };

  if (bio) data.description = bio.slice(0, 500);
  if (photoUrl) data.image = photoUrl;

  if (reviewCount > 0 && avgRating !== null) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avgRating,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return (
    <script
      type="application/ld+json"
      // Inline JSON; safe because we control all string values.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
