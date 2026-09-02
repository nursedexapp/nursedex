// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Nothing under src/ may be gitignored.
 *
 * This exists because it happened. `.gitignore` carried `Legal/` for the
 * repo-root folder of legal documents, unanchored, and a gitignore pattern
 * without a leading slash matches at EVERY depth. So `src/lib/legal/` was
 * silently excluded: `git add -A` reported nothing amiss, the commit went in
 * holding only the files that imported the new module, and the first sign of
 * trouble would have been a CI build failing on an import of a module that was
 * never pushed.
 *
 * That is the shape worth guarding. A file that is not added is invisible in
 * every way a person normally looks (status is clean, the diff is clean, the
 * commit looks right), and the failure surfaces somewhere else entirely.
 */
describe("every source file under src/ is visible to git", () => {
  it("has nothing under src/ excluded by a gitignore rule", () => {
    const ignored = execFileSync(
      "git",
      ["status", "--ignored=matching", "--short", "--", "src/"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((line) => line.startsWith("!!"))
      .map((line) => line.slice(3).trim());

    expect(
      ignored,
      `gitignore is excluding source files. Anchor the offending rule with a ` +
        `leading slash (Legal/ matches at every depth, /Legal/ matches only ` +
        `the repo root). Run: git check-ignore -v ${ignored[0] ?? "<path>"}`,
    ).toEqual([]);
  });
});
