// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
};

const API_ROOT = dirname(fileURLToPath(import.meta.url));

interface Route {
  id: string;
  usesSharedEmailHandler: boolean;
  guards: string[];
  hasTest: boolean;
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
        usesSharedEmailHandler: src.includes("handleEmailRoute"),
        guards: GUARDS.filter((g) => src.includes(g)),
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
