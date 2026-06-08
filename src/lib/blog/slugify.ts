/**
 * Turn a title into a URL slug. Pure string transform, no IO, so it is unit
 * testable on its own and safe to import from client code (kept separate
 * from slug.ts, which pulls in the server-only service-role client).
 * Decomposes accented characters and drops the combining marks (so "café"
 * becomes "cafe", not "cafe-"), lowercases, replaces any run of non
 * alphanumeric characters with a single hyphen, and trims hyphens.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
