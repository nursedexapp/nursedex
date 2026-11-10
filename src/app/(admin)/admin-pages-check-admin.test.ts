// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every admin page checks the role itself, before its first read.
 *
 * The admin layout calls requireAdmin(), and until 2026-11-10 that was the
 * only check on ten of these pages. A layout is not an auth boundary in this
 * version of Next: a page renders ALONGSIDE its layout, so the page's reads
 * start before the layout has redirected anybody, and a layout is not
 * re-rendered on client navigation at all
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts
 * and auth checks"). Most of these pages read through the service role
 * client, which no row level security stands behind.
 *
 * It surfaced as NURSEDEX-SITE-1D: a visitor who was not signed in loaded
 * /admin and the dashboard's count queries reached the database as them.
 *
 * "First await" rather than "somewhere in the file": a check started beside
 * a read, `Promise.all([requireAdmin(), getRows()])`, lets the read go out
 * before the check has answered. requireAdmin() is wrapped in React cache(),
 * so calling it here as well as in the layout costs no second lookup.
 */

const ADMIN_ROOT = join(__dirname);
const CHECK = /^await\s+(requireAdmin|requireSuperAdmin)\(\)/;

function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pagesUnder(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** The text of the default export from its declaration on. */
function defaultExportBody(source: string): string | null {
  const at = source.search(/export\s+default\s+async\s+function\b/);
  return at === -1 ? null : source.slice(at);
}

function problemWith(source: string): string | null {
  if (/export\s+(async\s+)?function\s+generateMetadata\b/.test(source)) {
    return "exports generateMetadata, which renders before any role check";
  }
  const body = defaultExportBody(source);
  if (body === null) {
    return "has no `export default async function`, so it cannot await the check";
  }
  const firstAwait = body.match(/await\s+[^;]*/);
  if (!firstAwait) return "never awaits requireAdmin() or requireSuperAdmin()";
  if (!CHECK.test(firstAwait[0])) {
    return `first awaits \`${firstAwait[0].slice(0, 60)}\` instead of requireAdmin() or requireSuperAdmin()`;
  }
  return null;
}

describe("every admin page checks the role before it reads anything", () => {
  const pages = pagesUnder(ADMIN_ROOT);

  it("finds the admin pages it is meant to guard", () => {
    // A scan that finds nothing passes everything (L98).
    expect(pages.length).toBeGreaterThanOrEqual(16);
  });

  it.each(pages.map((p) => [relative(ADMIN_ROOT, p), p]))(
    "%s",
    (_name, path) => {
      expect(problemWith(readFileSync(path, "utf8"))).toBeNull();
    },
  );

  // The guard itself, seen to fail on the shapes it exists to refuse (L1).
  it("refuses a page whose check comes after a read, or beside one", () => {
    expect(
      problemWith(
        "export default async function P() {\n  const rows = await getRows();\n  await requireAdmin();\n}",
      ),
    ).toMatch(/first awaits `await getRows\(\)`/);
    expect(
      problemWith(
        "export default async function P() {\n  const [me, rows] = await Promise.all([requireAdmin(), getRows()]);\n}",
      ),
    ).toMatch(/first awaits `await Promise.all/);
    expect(
      problemWith("export default async function P() {\n  return null;\n}"),
    ).toMatch(/never awaits/);
    expect(
      problemWith(
        "export async function generateMetadata() {}\nexport default async function P() {\n  await requireAdmin();\n}",
      ),
    ).toMatch(/generateMetadata/);
    expect(
      problemWith(
        "export default async function P() {\n  const me = await requireSuperAdmin();\n  await getRows();\n}",
      ),
    ).toBeNull();
  });
});
