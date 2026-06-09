import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/NurseDex/);
});

test("a nonexistent nurse profile is noindexed", async ({ page }) => {
  // The profile route streams behind nurses/loading.tsx, so a missing profile
  // can't return a real 404 status; instead it must be noindexed so search
  // engines don't index the soft-404 page. See #323.
  await page.goto("/nurses/zzz-definitely-not-a-real-nurse-12345");
  const robots = await page
    .locator('meta[name="robots"]')
    .first()
    .getAttribute("content");
  expect(robots).toContain("noindex");
});

test("a nonexistent blog post returns a real 404", async ({ page }) => {
  // Blog routes are not behind a loading.tsx, so notFound() yields a true 404.
  // Guards against a future loading.tsx turning these into soft-404s (HTTP
  // 200), which matters for SEO on indexable blog URLs. See #326.
  const res = await page.goto("/blog/zzz-definitely-not-a-real-post-12345");
  expect(res?.status()).toBe(404);
});
