// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { maskNonCode } from "../../../scripts/guard-mutation";

// The completeness guard for API routes.
//
// Server actions and pages each have one (authz-boundary.test.ts and
// page-authz-boundary.test.tsx): add a guarded action or page with no boundary
// test and CI fails naming it. API routes had no such check, so the guarantee
// stopped at the edge of the app. That is exactly how the gaps closed in #617,
// #629, #618 and #633 accumulated: nothing forced a new guarded surface to be
// tested, so some simply never were, and two email routes had slipped through
// even after this session's sweeps.
//
// Every route must be one of three things, and a new one has to be classified:
//
//   1. built on handleEmailRoute, whose CRON_SECRET guard is tested once in
//      src/lib/email/route-handler.test.ts and shared by ~28 routes
//   2. guarded by its own check, and carrying a colocated route.test.ts
//   3. deliberately public, and named in PUBLIC_ROUTES below
//
// This does not check that the test is any GOOD. It checks that one exists.
// Whether it can actually fail is what the mutation testing in those PRs is for.

/** Everything that decides "may this caller proceed". */
const GUARDS = [
  "verifyCronAuth",
  "verifyBearerSecret",
  "verifySecretHeader",
  "verifySlackRequest",
  "verifySignature",
  "constructEvent", // Stripe webhook signature verification
  "getCurrentUser",
  "requireAdmin",
  "requireSuperAdmin",
  "requireAuth",
  "requireRole",
];

/**
 * Routes with no guard, by design. Each is a public endpoint whose safety comes
 * from something other than authenticating the caller, so state that reason here
 * rather than leaving a bare "no guard" to be read as an oversight.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "csp-report/route.ts":
    "A browser posts here when it blocks something. It is a public sink by definition and fails SAFE: it never throws, always 204 (#537).",
  "newsletter/unsubscribe/route.ts":
    "Reached from a one-click link in an email by someone who is not signed in. The unguessable token in the URL is the credential.",
  "stripe/checkout-success/route.ts":
    "The page Stripe redirects a paying customer back to. It reads a session_id and verifies it with Stripe rather than authenticating the caller.",
  "nurse-photo/[token]/route.ts":
    "Serves nurse photos, which are public on the directory (decision 2026-09-01, #873), so there is no caller to authenticate. It is scoped instead of guarded: it will only sign a path our own server encrypted into the token, so a caller cannot name a path or reach anything the app did not itself put in a page, and an unverifiable token is refused. See its colocated route.test.ts (#871).",
};

const API_ROOT = dirname(fileURLToPath(import.meta.url));

interface Route {
  id: string;
  usesSharedEmailHandler: boolean;
  guards: string[];
  hasTest: boolean;
}

/**
 * The guards a route actually CALLS (#644).
 *
 * This used to be `src.includes(guard)`: a plain substring search over the whole
 * file, comments included. A route whose guard had been commented OUT, or which
 * merely named one in a comment, still counted as fully guarded and was never
 * required to carry a test. A false positive here is the worst kind, because
 * this check is what decides a route needs a test at all: it removes the surface
 * from scrutiny entirely rather than merely mis-scoring it.
 *
 * So it matches a CALL, in code, using the same comment stripping the mutation
 * gate uses to find its own call sites. "Guarded" now means "calls a guard", not
 * "mentions one", which is what the page equivalent has always required.
 *
 * An `import { requireAdmin } from ...` line names the guard without calling it,
 * and is not matched: there is no `(` after the name.
 */
export function guardsIn(source: string): string[] {
  const code = maskNonCode(source);
  return GUARDS.filter((g) => new RegExp(`\\b${g}\\s*\\(`).test(code));
}

/** Does the route really hand off to the shared email handler, or just say so? */
function usesEmailHandler(source: string): boolean {
  return /\bhandleEmailRoute\s*\(/.test(maskNonCode(source));
}

function collectRoutes(dir = API_ROOT, out: Route[] = []): Route[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRoutes(full, out);
    } else if (entry.name === "route.ts") {
      const src = readFileSync(full, "utf8");
      out.push({
        id: relative(API_ROOT, full).replace(/\\/g, "/"),
        usesSharedEmailHandler: usesEmailHandler(src),
        guards: guardsIn(src),
        hasTest: readdirSync(dir).includes("route.test.ts"),
      });
    }
  }
  return out;
}

const routes = collectRoutes();

describe("every API route is accounted for", () => {
  it("finds routes at all (a broken scan must not pass silently)", () => {
    // Without this, a walk that returned nothing would make every assertion
    // below vacuously true: the failure mode this whole session was about.
    expect(routes.length).toBeGreaterThan(20);
  });

  it("has a test for every route that guards itself", () => {
    const unguarded = routes
      .filter((r) => !r.usesSharedEmailHandler && r.guards.length > 0)
      .filter((r) => !r.hasTest)
      .map((r) => r.id);

    expect(unguarded).toEqual([]);
  });

  it("has every unguarded route declared public, with a reason", () => {
    const undeclared = routes
      .filter((r) => !r.usesSharedEmailHandler && r.guards.length === 0)
      .filter((r) => !PUBLIC_ROUTES[r.id])
      .map((r) => r.id);

    // A new endpoint with no guard is either public on purpose (say so here) or
    // a missing guard. Silence is what let the waitlist export ship with a
    // secret in its URL and no test at all.
    expect(undeclared).toEqual([]);
  });

  it("keeps PUBLIC_ROUTES honest: no entry for a route that is now guarded", () => {
    const stale = Object.keys(PUBLIC_ROUTES).filter((id) => {
      const route = routes.find((r) => r.id === id);
      return !route || route.guards.length > 0;
    });

    expect(stale).toEqual([]);
  });
});

// #644. "Guarded" has to mean "calls a guard", not "mentions one". A false
// positive here does not merely mis-score a route: it removes the route from
// scrutiny, because this check is what decides the route needs a test at all.
describe("a route counts as guarded only when it CALLS a guard", () => {
  it("does not count a guard named in a comment", () => {
    expect(
      guardsIn(`// requireAdmin is not needed here, this route is public.
export async function GET() {
  return Response.json({ ok: true });
}
`),
    ).toEqual([]);
  });

  it("does not count a guard that has been commented OUT", () => {
    // The shape that made this worth fixing: the guard is gone, the route is
    // wide open, and the old substring search still called it fully guarded and
    // never asked it for a test.
    expect(
      guardsIn(`export async function POST() {
  // const admin = await requireAdmin();
  return Response.json({ ok: true });
}
`),
    ).toEqual([]);
  });

  it("does not count a guard that is only imported", () => {
    expect(
      guardsIn(`import { requireAdmin } from "@/lib/auth/helpers";
export async function GET() {
  return Response.json({ ok: true });
}
`),
    ).toEqual([]);
  });

  it("counts a guard that is really called", () => {
    expect(
      guardsIn(`import { requireAdmin } from "@/lib/auth/helpers";
export async function POST() {
  const admin = await requireAdmin();
  return Response.json({ id: admin.id });
}
`),
    ).toEqual(["requireAdmin"]);
  });
});
