/**
 * The "Last updated" dates on the legal pages (#716).
 *
 * These dates are a claim about a legal document, and they used to be typed
 * into the pages by hand. The privacy policy carried a date months older than
 * its own text, because the copy changed and nobody remembered the line at the
 * top. That is worse than carrying no date at all: it tells a reader the terms
 * have not changed since a day on which they demonstrably had.
 *
 * So the date is recorded here next to a hash of the page's own prose, and
 * last-updated.test.ts recomputes that hash. Edit a sentence on either page
 * and the test fails, naming the page and telling you to move the date. The
 * hash covers the words only: restyling a paragraph does not demand a new
 * date, and neither does bumping the date itself.
 */

export interface LegalPageRecord {
  /** Repo-relative path to the page whose wording this describes. */
  path: string;
  /** Rendered as-is on the page. Move it whenever the prose below changes. */
  date: string;
  /** sha256 of extractProse(readFileSync(path)). */
  proseSha: string;
}

/**
 * The visible words of a legal page, with the markup taken out.
 *
 * Deliberately crude, and it only has to be two things: deterministic, and
 * sensitive to the words while blind to the styling. It starts at the first
 * `return (` so imports cannot trip it, then drops JSX tags along with every
 * attribute inside them, so a className change is invisible here.
 */
export function extractProse(source: string): string {
  const markupStart = source.indexOf("return (");
  const markup = markupStart === -1 ? source : source.slice(markupStart);

  return markup
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ") // JSX comments
    .replace(/<[^>]*>/g, " ") // tags, and the attributes inside them
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const LEGAL_PAGES = {
  privacy: {
    path: "src/app/(public)/privacy/page.tsx",
    date: "September 2, 2026",
    proseSha:
      "f9e3d5e65465f55ce510fba22dd0db41fb26b2626d22229819a442550cc62c5b",
  },
  terms: {
    path: "src/app/(public)/terms/page.tsx",
    date: "June 9, 2026",
    proseSha:
      "c522b5402f3b07b8c6065f8783ec4972e7797cca8e80f3bd58d652b1c6ef5821",
  },
} as const satisfies Record<string, LegalPageRecord>;
