import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every searchNurses call site, with the value it passes for viewerIsSignedIn.
 *
 * The type makes the flag required, so a call site cannot forget it. What the
 * type cannot check is the VALUE, and the wrong value here is a specific,
 * plausible mistake: a default of false would tell a paying family on their
 * own dashboard to log in to see a rate (#773).
 *
 * Two of these three pages are behind auth and pass a literal true. The public
 * directory derives it from the viewer. None of them may pass a literal false.
 */
const CALL_SITES = [
  {
    file: "src/app/(public)/nurses/page.tsx",
    what: "the public directory, where the viewer may be anyone",
    passes: "viewerIsSignedIn: !!user",
  },
  {
    file: "src/app/(public)/survey/results/page.tsx",
    what: "survey results, reached by logged in families too",
    passes: "viewerIsSignedIn: !!viewer",
  },
  {
    file: "src/app/(dashboard)/dashboard/page.tsx",
    what: "the family dashboard, behind requireAuth",
    passes: "viewerIsSignedIn: true",
  },
];

describe("searchNurses call sites", () => {
  it.each(CALL_SITES)("$file states it for $what", ({ file, passes }) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("searchNurses(");
    expect(source).toContain(passes);
  });

  it.each(CALL_SITES)("$file never hard-codes false", ({ file }) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("viewerIsSignedIn: false");
  });

  // A hand-written list goes stale the moment a fourth call site is added, and
  // then reports green while blind to it. Find them instead of listing them.
  it("knows about every call site there is", () => {
    const found = sourceFilesUnder("src/app").filter((f) =>
      readFileSync(f, "utf8").includes("searchNurses("),
    );
    expect(found.map(normalise).sort()).toEqual(
      CALL_SITES.map((c) => c.file).sort(),
    );
  });
});

function normalise(path: string): string {
  return path.split(sep).join("/");
}

const sep = join("a", "b").slice(1, -1);

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFilesUnder(full));
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}
