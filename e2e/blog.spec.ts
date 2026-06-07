import { test, expect } from "@playwright/test";

// Like the rest of this suite, these tests avoid real Supabase auth (no
// local DB or seeded admin in CI). They cover what is verifiable without a
// session: the public index renders, unknown posts 404, and the admin CMS
// is gated. The authenticated create -> publish -> appears flow is covered
// by the unit tests in src/lib/blog/*.test.ts plus the manual verification
// steps in the plan.

test.describe("Public blog", () => {
  test("index page renders", async ({ page }) => {
    await page.goto("/blog");
    await expect(
      page.getByRole("heading", { name: "The NurseDex Blog" }),
    ).toBeVisible();
  });

  test("unknown post slug returns 404", async ({ page }) => {
    const res = await page.goto("/blog/this-post-does-not-exist-zzz");
    expect(res?.status()).toBe(404);
  });
});

test.describe("Admin blog gating", () => {
  test("admin blog redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/admin/blog");
    await page.waitForURL(/\/(login|admin\/blog)/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/login/);
  });
});
