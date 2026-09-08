// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every public page must be REACHABLE by a signed out visitor who starts at the
 * homepage and follows links.
 *
 * A page nothing links to works perfectly for whoever built it, because they
 * have the address, and is invisible to everybody else (L546). That is not
 * hypothetical here: on 2026-09-05 `/pricing`, the page that sells Featured at
 * $29/mo to the audience this product actually acquires, could only be reached
 * from inside a signed in nurse's dashboard, and `/about`, `/faq` and
 * `/contact` could not be reached at all (#1042).
 *
 * REACHABILITY, NOT MERE MENTION. The first version of this guard asked only
 * whether some file in `src` wrote the route as an href. It passed on `/pricing`,
 * because three dashboard surfaces link it, and on `/contact`, because `/about`
 * and `/faq` link it and both were themselves unreachable. A guard answered by
 * a link nobody can follow measures the wrong thing (L63, L400), so this one
 * walks the graph: it starts at `/`, follows only links that appear on pages a
 * visitor has already arrived at, and asks what it never reaches.
 *
 * Routes are enumerated from the FILESYSTEM rather than from a hand kept list,
 * so a page added tomorrow is judged the same way (L96). A route the walk does
 * not reach must be named in EXEMPT with the reason it has none.
 *
 * EXEMPT is held to the same standard in the other direction: a route listed
 * there that HAS become reachable fails the suite, so the list cannot quietly
 * ossify into a record of what was once true (L182, L336).
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const PUBLIC_APP = join(here, "(public)");

/**
 * Routes a signed out visitor deliberately cannot walk to, each with the reason.
 *
 * Write the REASON, not just the route: the next person to run this needs to
 * know whether the absence was chosen or forgotten (L233).
 */
const EXEMPT: Record<string, string> = {
  "/welcome":
    "A permanent redirect to /, kept so the pre-launch marketing URL that Google already indexed resolves instead of 404ing. Linking it would send a visitor through a redirect to the page they are already on.",
  "/newsletter/confirm":
    "The destination of a tokenised link in a subscription confirmation email. It is addressed to one subscriber and means nothing without that token.",
  "/newsletter/unsubscribe":
    "The destination of the unsubscribe link carried in every newsletter email, addressed with a token.",
  "/unsubscribe":
    "The destination of the unsubscribe link in transactional email, addressed with a token.",
  "/onboarding/family":
    "Reached by redirect immediately after a family chooses their role at signup, never by a link a visitor follows.",
  "/survey/results":
    "Shown to a family as the result of submitting the survey, and linked from the survey itself rather than from the site's navigation.",
};

/**
 * The chrome every public page carries. Links here are available from every
 * node in the walk, which is what makes a footer link a real answer to
 * reachability while a link buried on one unreachable page is not.
 */
const SITE_CHROME = [
  join(PUBLIC_APP, "layout.tsx"),
  join(SRC, "app", "layout.tsx"),
];

function walkFiles(dir: string, keep: (f: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walkFiles(full, keep));
    else if (keep(full)) files.push(full);
  }
  return files;
}

function pageRoutes(dir: string, prefix = ""): Map<string, string> {
  const routes = new Map<string, string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // A route group like (public) adds a directory but no path segment.
      const segment = entry.startsWith("(") ? "" : `/${entry}`;
      for (const [r, f] of pageRoutes(full, prefix + segment)) routes.set(r, f);
    } else if (entry === "page.tsx") {
      routes.set(prefix === "" ? "/" : prefix, full);
    }
  }
  return routes;
}

/** Resolve one import specifier to a file inside src, or null if it leaves. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;

  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /(?:from|import)\s*["']([^"']+)["']/g;

/** Every file this one renders, transitively, staying inside src. */
function closure(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = entries.filter((f) => existsSync(f));
  while (queue.length) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT)) {
      const next = resolveImport(file, match[1]);
      if (next && !seen.has(next) && !/\.test\.tsx?$/.test(next))
        queue.push(next);
    }
  }
  return [...seen];
}

/**
 * The routes written as an href anywhere in these files, allowing a fragment or
 * a query string after the path.
 *
 * Both spellings count, because both are real links: the JSX attribute
 * `href="/x"`, and `href: "/x"` inside a list of links that a component maps
 * over. Matching only the first was the state of this guard for one commit,
 * and it reported the footer's own link row as unreachable the moment those
 * links moved into an array (L135: a check written against one spelling of a
 * thing does not see the others).
 *
 * Anchoring on `href` is what keeps a redirect target or a fetch path from
 * counting as navigation, and matching the exact route followed by a closing
 * quote is what keeps `/nurses` from being answered by `/nurses/${slug}`.
 */
function hrefsIn(files: string[], candidates: string[]): string[] {
  const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
  return candidates.filter((route) => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `href\\s*[:=]\\s*\\{?["'\`]${escaped}(?:["'\`#?])`,
    ).test(text);
  });
}

const routeFiles = pageRoutes(PUBLIC_APP);
const routes = [...routeFiles.keys()].filter((r) => !r.includes("["));

const chromeLinks = hrefsIn(closure(SITE_CHROME), routes);

/** Breadth first from the homepage, exactly as a visitor would walk it. */
function reachable(): Set<string> {
  const found = new Set<string>(["/"]);
  const queue = ["/"];
  while (queue.length) {
    const route = queue.shift() as string;
    const file = routeFiles.get(route);
    const onThisPage = file ? hrefsIn(closure([file]), routes) : [];
    for (const next of [...onThisPage, ...chromeLinks]) {
      if (!found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }
  return found;
}

const walked = reachable();

describe("public route reachability", () => {
  it("walks a real graph, so this guard cannot pass by scanning nothing", () => {
    // A scanner that enumerates nothing reports every route as fine (L98).
    expect(routes.length).toBeGreaterThan(15);
    expect(routes).toContain("/pricing");
    // Proves the walk actually traverses, rather than returning its seed.
    expect(walked.size).toBeGreaterThan(5);
    expect(walked).toContain("/nurses");
  });

  it.each(routes.filter((r) => !(r in EXEMPT)))(
    "a signed out visitor starting at the homepage can walk to %s",
    (route) => {
      expect(
        walked.has(route),
        `Nothing a visitor can reach links to ${route}. Link it from the site chrome or from a page that is itself reachable, or add it to EXEMPT in src/app/public-route-reachability.test.ts with the reason it has none.`,
      ).toBe(true);
    },
  );

  it.each(Object.keys(EXEMPT))(
    "%s is still genuinely unreachable, so its exemption is still true",
    (route) => {
      expect(
        walked.has(route),
        `${route} is exempted as unreachable but a visitor can now walk to it. Remove it from EXEMPT.`,
      ).toBe(false);
    },
  );

  it("exempts only routes that exist, and gives every one a reason", () => {
    for (const [route, reason] of Object.entries(EXEMPT)) {
      expect(routes, `${route} is exempted but has no page`).toContain(route);
      expect(reason.trim().length, `${route} has no reason`).toBeGreaterThan(30);
    }
  });
});

export const SRC_ROOT = relative(process.cwd(), SRC);
