import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceFilesUnder, normalise } from "./source-files";

const scratch = mkdtempSync(join(tmpdir(), "source-files-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("sourceFilesUnder", () => {
  it("finds the files under a directory, recursively", () => {
    const found = sourceFilesUnder("src/lib/nurses").map(normalise);
    expect(found).toContain("src/lib/nurses/visibility.ts");
  });

  // A guard built on a scan that silently returns nothing passes while blind,
  // and reads exactly like a clean codebase (L98). The two ways of getting
  // nothing are different faults with different fixes, so they say different
  // things (L11): a path that is wrong, and a path that is right and empty.
  it("refuses a path that does not exist, and says so", () => {
    expect(() => sourceFilesUnder(join(scratch, "nope"))).toThrow(
      /does not exist/i,
    );
  });

  it("refuses a directory that exists but holds nothing, and says so", () => {
    const empty = join(scratch, "empty");
    mkdirSync(empty);
    expect(() => sourceFilesUnder(empty)).toThrow(/found no files/i);
  });

  it("does not memoise a refusal", () => {
    const missing = join(scratch, "still-nope");
    expect(() => sourceFilesUnder(missing)).toThrow();
    mkdirSync(missing);
    writeFileSync(join(missing, "found.ts"), "");
    expect(sourceFilesUnder(missing).map(normalise)).toEqual([
      normalise(join(missing, "found.ts")),
    ]);
  });
});
