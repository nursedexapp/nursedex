import { describe, it, expect } from "vitest";
import { sourceFilesUnder, normalise } from "./source-files";

describe("sourceFilesUnder", () => {
  it("finds the files under a directory, recursively", () => {
    const found = sourceFilesUnder("src/lib/nurses").map(normalise);
    expect(found).toContain("src/lib/nurses/visibility.ts");
  });

  it("refuses a directory it found nothing in", () => {
    // A guard built on a scan that silently returns nothing passes while
    // blind, and the wrong path reads exactly like a clean codebase (L98).
    expect(() => sourceFilesUnder("src/lib/nurses/no-such-dir")).toThrow(
      /no files/i,
    );
  });

  it("does not memoise an empty answer", () => {
    expect(() => sourceFilesUnder("src/lib/nurses/no-such-dir")).toThrow();
    expect(() => sourceFilesUnder("src/lib/nurses/no-such-dir")).toThrow();
  });
});
