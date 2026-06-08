import type { TocHeading } from "@/lib/blog/toc";

/**
 * In-page table of contents. Only shown for longer posts (3+ headings).
 * Anchors match the ids the renderer assigns to headings.
 */
export function BlogToc({ headings }: { headings: TocHeading[] }) {
  if (headings.length < 3) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="border-sage-light/40 bg-warm-white mb-8 rounded-lg border p-4"
    >
      <p className="text-soft-black-light mb-2 text-xs font-semibold tracking-wide uppercase">
        Contents
      </p>
      <ul className="space-y-1 text-sm">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: `${(h.level - 2) * 12}px` }}>
            <a
              href={`#${h.id}`}
              className="text-soft-black hover:text-teal-dark transition-colors"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
