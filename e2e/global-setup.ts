import { waitForRouteReady } from "../test/route-ready";

// Playwright's webServer only waits for the base URL to answer, but `next dev`
// (Turbopack) compiles routes on demand, so the first request to a route the
// server has not reached yet comes back as a real 404. Specs that landed in
// that window got the 404 page and then failed on a missing element, which
// read as a random flake and cost a manual re-run (#623).
//
// Warming each route the suite depends on closes that window: by the time the
// first spec runs, every route below has been compiled and is being served.
// The routes are the ones observed 404ing (/admin/blog) plus the ones the
// specs navigate to first.
// Warmed before any spec runs, because Turbopack compiles a route on its first
// request and a spec that lands there first pays that compile out of its own
// budget. The nurse onboarding funnel was the flake in #805: `waitForURL` after
// role selection timed out at 20s waiting for /dashboard/onboarding to exist,
// which nothing here had warmed.
const ROUTES = [
  "/",
  "/login",
  "/blog",
  "/nurses",
  "/admin/blog",
  "/role-select",
  "/dashboard",
  "/dashboard/onboarding",
];

export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  // Serially, not in parallel: the point is to let the dev server finish
  // compiling one route before asking it for the next, rather than handing it
  // a burst of cold requests, which is the situation that produced the flake.
  for (const route of ROUTES) {
    await waitForRouteReady(`${baseURL}${route}`);
  }
}
