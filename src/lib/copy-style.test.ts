// @vitest-environment node
//
// Regression guard for the writing-style rule: no em dashes or en dashes
// anywhere we maintain. The rule covers copy people read (Slack messages, admin
// UI strings, editor placeholders) and code comments alike.
//
// The pre-push style hook already blocks a dash on any NEW line. This catches
// one reintroduced by an edit that never reaches the hook: a rebase, a revert,
// or an editor autocorrecting "--" into an em dash.
//
// supabase/migrations is deliberately excluded. Those files are an applied
// historical record; rewriting their comments would churn migrations that have
// already run against production.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

const SCANNED_DIRS = ["src", "scripts", "e2e", "test"];
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".md"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

describe("code comments contain no em or en dashes", () => {
  it.each(SCANNED_DIRS)("%s/ is free of dash punctuation", (dir) => {
    const offenders: string[] = [];

    for (const file of walk(join(process.cwd(), dir))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (DASHES.test(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}`);
        }
      });
    }

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
