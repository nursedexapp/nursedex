import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sourceFilesUnder, normalise } from "../../test/source-files";

/**
 * PostHog may only be started or written to through src/lib/posthog.ts and
 * src/lib/analytics/capture.ts, because those are where the consent gate is.
 * Any other import of posthog-js is a way around it (L247: enumerate the
 * capability, not one spelling of it).
 */
const ALLOWED = new Set([
  "src/lib/posthog.ts",
  "src/lib/analytics/capture.ts",
  "src/lib/analytics/preference.ts",
]);

function appFiles(): string[] {
  const files = sourceFilesUnder("src")
    .map(normalise)
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
  if (files.length === 0) throw new Error("scanned no files, so this guard proves nothing");
  return files;
}

// Any import or re-export from posthog-js or one of its subpaths, except a
// type-only one (which loads nothing at runtime).
const RUNTIME_POSTHOG_IMPORT = /^(?!\s*(?:import|export)\s+type\b).*\bfrom\s+["']posthog-js(?:\/[\w-]+)?["']/m;

describe("PostHog has one way in", () => {
  it("imports posthog-js only where the consent gate lives", () => {
    const offenders = appFiles().filter(
      (file) => !ALLOWED.has(file) && RUNTIME_POSTHOG_IMPORT.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("checks consent in initPostHog before init, and in captureClientEvent before capture", () => {
    const init = readFileSync("src/lib/posthog.ts", "utf8");
    expect(init.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(init.indexOf("analyticsAllowed()")).toBeLessThan(init.indexOf("posthog.init("));
    const capture = readFileSync("src/lib/analytics/capture.ts", "utf8");
    expect(capture.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(capture.indexOf("analyticsAllowed()")).toBeLessThan(capture.indexOf("posthog.capture("));
  });
});
