// @vitest-environment node
//
// Regression guard for the writing-style rule: no em dashes or en dashes in
// copy anyone reads. Slack messages, admin UI strings, and editor placeholders
// all count as output.
//
// Scoped to files whose dashes were real copy rather than code comments. The
// pre-push style hook already blocks a dash on any NEW line; this catches a
// dash reintroduced into these files by an edit that never reaches the hook
// (a rebase, a revert, an editor autocorrect turning "--" into an em dash).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Built from code points so this file contains neither character itself, which
// would otherwise trip the very style hook it exists to enforce.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const DASHES = new RegExp(`[${EM_DASH}${EN_DASH}]`);

/** Files whose dashes lived in strings people read, not in comments. */
const COPY_FILES = [
  "src/lib/slack/invoice.ts",
  "src/app/(admin)/admin/blog/page.tsx",
  "src/app/(admin)/admin/blog/[id]/revisions/page.tsx",
  "src/components/blog/tiptap/FootnoteNodeView.tsx",
];

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("copy contains no em or en dashes", () => {
  it.each(COPY_FILES)("%s is free of dash punctuation", (file) => {
    const offenders = read(file)
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => DASHES.test(line))
      .map(({ line, n }) => `${file}:${n} ${line.trim()}`);

    expect(offenders).toEqual([]);
  });
});

describe("the replacements read as real sentences", () => {
  it("the invoice header names the month without punctuation tricks", () => {
    expect(read("src/lib/slack/invoice.ts")).toMatch(
      /text: `Invoice for \$\{monthLabel\}`/,
    );
  });

  it("a missing publish date says so instead of showing a bare dash", () => {
    expect(read("src/app/(admin)/admin/blog/page.tsx")).toMatch(
      /if \(!iso\) return "Not set";/,
    );
  });
});
