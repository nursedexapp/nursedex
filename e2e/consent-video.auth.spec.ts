import { test, expect } from "@playwright/test";
import { fillNewPost } from "./helpers/blog-post";
import { serviceClient } from "./helpers/provision";

// A blog video fetches nothing from its provider until the reader plays it,
// so YouTube and Vimeo learn nothing about a visitor who only reads the post.
//
// In the authenticated project because no post with a video exists in any
// data: this one is written through the admin editor, the way
// blog.author.auth.spec.ts writes posts, against the throwaway local Supabase
// CI starts (E2E_AUTH=1, see e2e/README.md), and deleted afterwards.

const PROVIDER =
  /^https:\/\/([\w-]+\.)*(youtube\.com|ytimg\.com|vimeo\.com|vimeocdn\.com)\//;
const VIDEO_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
// A 1x1 PNG, served in place of the preview so the thumbnail route never
// fetches from the provider on the server during a test.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

let title: string | null = null;

test.afterEach(async () => {
  if (!title) return;
  const { error } = await serviceClient()
    .from("blog_posts")
    .delete()
    .eq("title", title);
  title = null;
  if (error)
    throw new Error(`Could not delete the test post: ${error.message}`);
});

test("a blog video fetches nothing from its provider until played", async ({
  page,
  context,
}) => {
  // Refuses anything but a local Supabase, before a post is written.
  const service = serviceClient();

  title = `E2E Video ${Date.now()}`;
  await fillNewPost(page, title, "A post with a video in it.");
  await page.getByRole("button", { name: "Embed a video" }).click();
  await page.getByPlaceholder("Paste a YouTube or Vimeo URL").fill(VIDEO_URL);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("YouTube embed")).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.waitForURL(/\/admin\/blog$/);

  const { data: post, error } = await service
    .from("blog_posts")
    .select("slug")
    .eq("title", title)
    .single();
  if (error || !post) {
    throw new Error(`The published post was not found: ${error?.message}`);
  }

  let previews = 0;
  await context.route("**/api/video-thumbnail/**", async (route) => {
    previews += 1;
    await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
  });
  const provider: string[] = [];
  page.on("request", (request) => {
    if (PROVIDER.test(request.url())) provider.push(request.url());
  });
  // Recorded above, answered here, so the player never reaches the network.
  await context.route(PROVIDER, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>player</title>",
    }),
  );

  await page.goto(`/blog/${post.slug}`);
  const play = page.getByRole("button", { name: "Play YouTube video" });
  await play.scrollIntoViewIfNeeded();
  // Positive control: the preview image was requested, from NurseDex, so the
  // empty list below is about a page that did load its video block.
  await expect.poll(() => previews).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  expect(provider).toEqual([]);

  await play.click();
  await expect.poll(() => provider.length).toBeGreaterThan(0);
});
