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
let published = false;

test.afterEach(async () => {
  if (!title) return;
  const { data, error } = await serviceClient()
    .from("blog_posts")
    .delete()
    .eq("title", title)
    .select("id");
  const expectOne = published;
  title = null;
  published = false;
  if (error) {
    throw new Error(`Could not delete the test post: ${error.message}`);
  }
  // A published post that deletes nothing means the cleanup is aimed wrong,
  // and every run would leave a post behind.
  if (expectOne) expect(data, "test posts deleted").toHaveLength(1);
});

test("a blog video fetches nothing from its provider until played", async ({
  page,
  context,
}) => {
  // Refuses anything but a local Supabase, before a post is written.
  const service = serviceClient();

  // A timestamp alone collides when workers start in the same millisecond,
  // and the afterEach deletes by title, so one run would delete another's
  // post. The random suffix keeps each run's post its own.
  title = `E2E Video ${Date.now()} ${crypto.randomUUID().slice(0, 8)}`;
  await fillNewPost(page, title, "A post with a video in it.");
  await page.getByRole("button", { name: "Embed a video" }).click();
  // Enter submits the inline field (PostEditor's onKeyDown). The page has a
  // second "Add" button elsewhere, so a button lookup is ambiguous.
  const embedUrl = page.getByPlaceholder("Paste a YouTube or Vimeo URL");
  await embedUrl.fill(VIDEO_URL);
  await embedUrl.press("Enter");
  await expect(page.getByText("YouTube embed")).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.waitForURL(/\/admin\/blog$/);
  published = true;

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
  // Bring the whole post into view without touching the video block, so a
  // lazily loaded preview or player has every chance to load on its own.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState("networkidle");
  // Checked first, so a player that loads before Play fails here and names
  // the provider URL it fetched, rather than as a missing button below.
  expect(provider, "requests to the video provider before Play").toEqual([]);
  const play = page.getByRole("button", { name: "Play YouTube video" });
  await expect(play).toBeVisible();
  // Positive control: the preview image was requested, from NurseDex, so the
  // empty list above is about a page that did load its video block.
  await expect.poll(() => previews).toBeGreaterThan(0);

  await play.click();
  await expect.poll(() => provider.length).toBeGreaterThan(0);
});
