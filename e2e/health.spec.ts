import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/NurseDex/);
});

test("a nonexistent nurse profile returns a real 404", async ({ page }) => {
  // The profile route streams behind a loading.tsx, so the 404 must be set in
  // generateMetadata (before the shell flushes), not via notFound() in the
  // page body. Guards against the soft-404 (HTTP 200) regression.
  const res = await page.goto("/nurses/zzz-definitely-not-a-real-nurse-12345");
  expect(res?.status()).toBe(404);
});
