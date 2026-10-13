import type { Page } from "@playwright/test";

/** The slug the CMS derives from a title that is not already taken. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Opens the admin editor on a new post and types its title and body. */
export async function fillNewPost(page: Page, title: string, body: string) {
  await page.goto("/admin/blog/new");
  await page.locator("#title").fill(title);
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(body);
}
