import { test, expect, type Page } from "@playwright/test";

// Smoke tests that load every key route as a signed-in admin and assert the
// page rendered without falling into an error boundary. This catches
// render-time crashes (e.g. a server component calling a client-only export,
// or a bad query) that typecheck and the build do not see and that otherwise
// only surface when the page is opened in production (see PR #268).
//
// Runs in the authenticated project (E2E_AUTH=1), which provisions a
// super_admin and reuses its session. See e2e/README.md.

// Static admin routes (dynamic [id] routes need a real record, so they are
// covered by the dedicated blog specs instead).
const ADMIN_ROUTES = [
  "/admin",
  "/admin/accounts",
  "/admin/admins",
  "/admin/analytics",
  "/admin/blog",
  "/admin/blog/new",
  "/admin/blog/comments",
  "/admin/blog/taxonomy",
  "/admin/disputes",
  "/admin/reviews",
  "/admin/verifications",
];

// Main public marketing/content routes.
const PUBLIC_ROUTES = [
  "/",
  "/nurses",
  "/blog",
  "/about",
  "/how-it-works",
  "/pricing",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
];

// Text rendered by the error boundaries (src/app/error.tsx and
// src/app/(admin)/admin/error.tsx). The boundary returns a 200, so a status
// check alone would miss a caught render crash. Assert the markers are absent.
const ERROR_MARKERS = [
  "We hit a snag", // root error boundary
  "That admin view didn't load", // admin error boundary
  "Something went wrong", // root error boundary eyebrow
];

async function expectRouteRenders(page: Page, route: string) {
  const res = await page.goto(route);
  expect(res, `no response for ${route}`).not.toBeNull();
  expect(res!.status(), `status for ${route}`).toBeLessThan(400);
  for (const marker of ERROR_MARKERS) {
    await expect(
      page.getByText(marker, { exact: false }),
      `error boundary "${marker}" on ${route}`,
    ).toHaveCount(0);
  }
}

test.describe("admin route smoke", () => {
  for (const route of ADMIN_ROUTES) {
    test(`admin route renders: ${route}`, async ({ page }) => {
      await expectRouteRenders(page, route);
    });
  }
});

test.describe("public route smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public route renders: ${route}`, async ({ page }) => {
      await expectRouteRenders(page, route);
    });
  }
});
