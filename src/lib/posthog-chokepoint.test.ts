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
    .filter(
      (f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
  if (files.length === 0)
    throw new Error("scanned no files, so this guard proves nothing");
  return files;
}

// Every way of loading posthog-js or one of its subpaths: a static import or
// re-export, a bare side effect import, a dynamic import() and a require().
// Type-only imports and re-exports load nothing at runtime, so they are
// removed first, including ones spread over several lines.
const POSTHOG_SPEC = String.raw`["']posthog-js(?:\/[\w-]+)?["']`;
const TYPE_ONLY = new RegExp(
  String.raw`\b(?:import|export)\s+type\b[\s\S]*?\bfrom\s+` + POSTHOG_SPEC,
  "g",
);
const RUNTIME_POSTHOG = new RegExp(
  String.raw`(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)` +
    POSTHOG_SPEC,
);
export function loadsPostHog(source: string): boolean {
  return RUNTIME_POSTHOG.test(source.replace(TYPE_ONLY, ""));
}

// Direct calls that record or identify. Each file allowed here checks consent
// itself before the call; anything else goes through captureClientEvent.
const DIRECT_CALL =
  /\bposthog\.(?:capture|identify|init|register|alias|group|setPersonProperties|startSessionRecording)\s*\(/;
const DIRECT_CALL_ALLOWED = new Set([
  "src/lib/posthog.ts",
  "src/lib/analytics/capture.ts",
  "src/components/PostHogProvider.tsx",
  "src/components/PostHogIdentify.tsx",
]);

/**
 * The bodies of every useEffect in a file, found by matching brackets from
 * each `useEffect(` to its close.
 */
export function effectBodies(source: string): string[] {
  const bodies: string[] = [];
  for (const m of source.matchAll(/\buseEffect\s*\(/g)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")" && --depth === 0) break;
    }
    bodies.push(source.slice(m.index, i + 1));
  }
  return bodies;
}

// An effect that sends an event must re-run when tracking becomes allowed, by
// listing `tracking` (useTrackingState) in its dependencies. Otherwise a
// capture refused before the visitor answered is never tried again, and a
// visitor who accepts on the page is not counted (lessons review of #1173).
export function sendsWithoutRetry(effect: string): boolean {
  if (!effect.includes("captureClientEvent(")) return false;
  const deps = effect.match(/\[([^\]]*)\]\s*,?\s*\)$/);
  return !deps || !/\btracking\b/.test(deps[1]);
}

describe("PostHog has one way in", () => {
  it("recognises every way of loading posthog-js, and not a type import", () => {
    // Positive and negative controls, so a regex that matches nothing cannot
    // pass the scan below on a clean tree.
    for (const loads of [
      'import posthog from "posthog-js";',
      "import { PostHog } from 'posthog-js/react';",
      'export { default } from "posthog-js";',
      'import "posthog-js";',
      'const ph = await import("posthog-js");',
      'const ph = require("posthog-js");',
    ])
      expect(loads, loads).toSatisfy(loadsPostHog);
    for (const typeOnly of [
      'import type { PostHog } from "posthog-js";',
      'import type {\n  PostHog,\n  Properties,\n} from "posthog-js";',
      'export type { PostHog } from "posthog-js";',
    ])
      expect(loadsPostHog(typeOnly), typeOnly).toBe(false);
  });

  it("loads posthog-js only where the consent gate lives", () => {
    const offenders = appFiles().filter(
      (file) => !ALLOWED.has(file) && loadsPostHog(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("records or identifies directly only in files that check consent first", () => {
    const offenders = appFiles().filter(
      (file) =>
        !DIRECT_CALL_ALLOWED.has(file) &&
        DIRECT_CALL.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("finds an effect that sends without retrying on Accept", () => {
    const once = `useEffect(() => {\n  if (a(b)) return;\n  captureClientEvent(E.X, { y: f(1) });\n}, [a]);`;
    const retries = `useEffect(() => {\n  if (tracking !== "allowed") return;\n  captureClientEvent(E.X);\n}, [event, tracking])`;
    const handler = `useEffect(() => { g(1); }, []);\nconst onClick = () => captureClientEvent(E.X);`;
    expect(effectBodies(once).some(sendsWithoutRetry)).toBe(true);
    expect(effectBodies(retries).some(sendsWithoutRetry)).toBe(false);
    expect(effectBodies(handler).some(sendsWithoutRetry)).toBe(false);
  });

  it("retries every event sent from an effect once the visitor accepts", () => {
    const offenders = appFiles().filter((file) =>
      effectBodies(readFileSync(file, "utf8")).some(sendsWithoutRetry),
    );
    expect(offenders).toEqual([]);
  });

  it("checks consent in initPostHog before init, and in captureClientEvent before capture", () => {
    const init = readFileSync("src/lib/posthog.ts", "utf8");
    expect(init.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(init.indexOf("analyticsAllowed()")).toBeLessThan(
      init.indexOf("posthog.init("),
    );
    const capture = readFileSync("src/lib/analytics/capture.ts", "utf8");
    expect(capture.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(capture.indexOf("analyticsAllowed()")).toBeLessThan(
      capture.indexOf("posthog.capture("),
    );
  });
});
