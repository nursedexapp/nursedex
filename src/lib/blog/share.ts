export interface ShareTarget {
  name: "X" | "Facebook" | "LinkedIn";
  href: string;
}

/**
 * Share-intent URLs for a post. Pure, so it is unit testable. Only the
 * post URL is needed (no account handles), and both values are encoded.
 */
export function buildShareLinks(url: string, title: string): ShareTarget[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { name: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  ];
}
