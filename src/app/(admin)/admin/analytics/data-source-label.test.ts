// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The admin analytics page and PostHog both count NurseDex activity, they
 * disagree on purpose, and neither is wrong (#867). A figure with no stated
 * source invites exactly the comparison that cannot be made, and the failure is
 * silent: the two numbers simply differ and whoever is reading picks one.
 *
 * So the page has to say where its numbers come from. This asserts the RULE
 * (the source is named, and it is the database) rather than the exact wording,
 * which is copy and will be reworded.
 */

const PAGE = "src/app/(admin)/admin/analytics/page.tsx";

/** Only the text a reader sees, so a code comment cannot satisfy this. */
function renderedCopy(): string {
  const source = readFileSync(PAGE, "utf8");
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlockComments.replace(/^\s*\/\/.*$/gm, " ");
}

describe("admin analytics page", () => {
  it("still exists where this guard thinks it does", () => {
    expect(readFileSync(PAGE, "utf8").length).toBeGreaterThan(0);
  });

  it("names the database as the source of its figures", () => {
    expect(renderedCopy()).toMatch(/from the database/i);
  });

  it("says so in copy a reader sees, not only in a comment", () => {
    // The comment above the notice also says "from the database", so stripping
    // comments is what makes this assertion mean anything at all.
    const commentsOnly = readFileSync(PAGE, "utf8").length - renderedCopy().length;
    expect(commentsOnly).toBeGreaterThan(0);
    expect(renderedCopy()).toMatch(/from the database/i);
  });

  it("tells the reader the two systems are not meant to reconcile", () => {
    expect(renderedCopy()).toMatch(/PostHog/);
    expect(renderedCopy()).toMatch(/reconcile/i);
  });
});
