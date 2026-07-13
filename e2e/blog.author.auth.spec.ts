import { test, expect } from "@playwright/test";

// Authenticated author flow. Runs as the seeded admin (storageState from
// auth.setup.ts) only when E2E_AUTH=1 against a local/test Supabase.

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fillNewPost(
  page: import("@playwright/test").Page,
  title: string,
  body: string,
) {
  await page.goto("/admin/blog/new");
  await page.locator("#title").fill(title);
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(body);
}

test("admin can create and publish a post that appears publicly", async ({
  page,
}) => {
  const title = `E2E Post ${Date.now()}`;
  const body = "Hello from the authenticated e2e test.";

  await fillNewPost(page, title, body);
  await page.getByRole("button", { name: "Publish now" }).click();

  // Back to the list, with the new post shown.
  await page.waitForURL(/\/admin\/blog$/);
  await expect(page.getByText(title)).toBeVisible();

  // The published post renders on its public page.
  await page.goto(`/blog/${slugify(title)}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();

  // And it appears on the public index.
  await page.goto("/blog");
  await expect(page.getByText(title)).toBeVisible();
});

// #674. The delete confirmation is opened from inside a dropdown menu, and the
// menu unmounts as it closes. If the dialog were a child of the menu it would be
// torn down with it: the confirmation would flash and vanish, and Delete would
// look like it simply did nothing. happy-dom cannot be trusted to reproduce that
// teardown, so this one is checked in a real browser.
test("the delete confirmation survives the menu that opened it", async ({
  page,
}) => {
  const title = `E2E Delete ${Date.now()}`;

  await fillNewPost(page, title, "This post exists to be deleted.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/admin\/blog$/);

  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: "Post actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // The menu is gone and the dialog is up, and it STAYS up.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("cannot be undone");

  // Cancelling leaves the post alone.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();

  // Confirming actually deletes it.
  await row.getByRole("button", { name: "Post actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete post" }).click();

  await expect(page.getByText(title)).toHaveCount(0);
});

test("a saved draft never appears publicly", async ({ page }) => {
  const title = `E2E Draft ${Date.now()}`;

  await fillNewPost(page, title, "This draft should stay private.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/admin\/blog$/);

  // Not on the index and the direct URL 404s (draft is not published).
  await page.goto("/blog");
  await expect(page.getByText(title)).toHaveCount(0);

  const res = await page.goto(`/blog/${slugify(title)}`);
  expect(res?.status()).toBe(404);
});
