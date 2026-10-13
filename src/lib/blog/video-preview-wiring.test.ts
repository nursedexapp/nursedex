import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The preview route refuses an unsigned request, so a published post shows
 * a video preview only if its page signs one. That signing has to happen on
 * the server, in the post page, and reach PostContent through BlogArticle. A
 * source read is what can establish that wiring without a database; what the
 * signatures are worth is tested in video-preview-token.test.ts and the
 * route's own test.
 */
const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("published posts sign their video previews", () => {
  it("the post page signs every video in the post and hands the paths down", () => {
    const page = read("src/app/(public)/blog/[slug]/page.tsx");
    expect(page).toMatch(/videoPreviewPaths\(\s*post\.content\s*\)/);
    expect(page).toMatch(/<BlogArticle[\s\S]*?videoPreviews=\{/);
  });

  it("BlogArticle passes them to PostContent", () => {
    const article = read("src/components/blog/BlogArticle.tsx");
    expect(article).toMatch(/<PostContent[^>]*videoPreviews=\{videoPreviews\}/);
  });

  it("the client side draft preview never imports the signer", () => {
    const preview = read("src/components/blog/BlogPreviewArticle.tsx");
    expect(preview).not.toMatch(/video-preview-token/);
  });
});
