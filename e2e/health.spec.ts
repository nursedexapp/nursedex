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
