import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sourceFilesUnder, normalise } from "../../../test/source-files";
import { ANALYTICS_EVENTS } from "./events";

/**
 * A name in ANALYTICS_EVENTS reads as an event that is being collected. Before
 * #864, 18 of 31 names had no call site at all, and PostHog cannot tell a never
 * fired event from a genuinely zero one, so the whole signup and onboarding
 * funnel was silently absent while the catalog looked complete.
 *
 * This guard closes that gap by DERIVING the call sites from the source rather
 * than listing them, so a name added without a call site fails here instead of
 * reopening the same gap quietly.
 */

type Source = { file: string; text: string };

let cachedSources: Source[] | null = null;

/**
 * Scanned once for the whole suite. A memo that can hold an EMPTY scan would
 * pass every assertion below at once, so an empty scan throws instead.
 */
function appSources(): Source[] {
  if (cachedSources) return cachedSources;
  const files = sourceFilesUnder("src").filter(isAppSource);
  const loaded = files.map((file) => ({ file, text: readFileSync(file, "utf8") }));
  if (loaded.length === 0) {
    throw new Error("scanned no source files under src, so this guard proves nothing");
  }
  cachedSources = loaded;
  return cachedSources;
}

function isAppSource(file: string): boolean {
  const path = normalise(file);
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return false;
  // The catalog defines every name, so counting it as a call site would make
  // this guard satisfy itself.
  if (path.endsWith("src/lib/analytics/events.ts")) return false;
  if (path.includes("__tests__")) return false;
  return !path.endsWith(".test.ts") && !path.endsWith(".test.tsx");
}

function callSitesFor(name: string): string[] {
  // Word boundary, so a name that is a prefix of another cannot answer for it.
  const reference = new RegExp(`ANALYTICS_EVENTS\\.${name}\\b`);
  return appSources()
    .filter((source) => reference.test(source.text))
    .map((source) => normalise(source.file));
}

const NAMES = Object.keys(ANALYTICS_EVENTS) as (keyof typeof ANALYTICS_EVENTS)[];

describe("analytics event catalog", () => {
  it("is not empty, so the cases below are real", () => {
    expect(NAMES.length).toBeGreaterThan(20);
  });

  it.each(NAMES)("%s is fired somewhere in the app", (name) => {
    expect(callSitesFor(name)).not.toEqual([]);
  });

  it("has no name that only the catalog itself mentions", () => {
    const unwired = NAMES.filter((name) => callSitesFor(name).length === 0);
    expect(unwired).toEqual([]);
  });

  /**
   * page_viewed was deleted rather than wired: PostHogProvider already fires
   * PostHog's own $pageview on every route change, and a second parallel event
   * would be a rival count of the same thing.
   */
  it("does not reintroduce a rival pageview event", () => {
    expect(Object.keys(ANALYTICS_EVENTS)).not.toContain("PAGE_VIEWED");
    expect(Object.values(ANALYTICS_EVENTS)).not.toContain("page_viewed");
  });

  it("uses the constant rather than a raw string at every call site", () => {
    const offenders: string[] = [];
    for (const [name, value] of Object.entries(ANALYTICS_EVENTS)) {
      const raw = new RegExp(`capture\\(\\s*["'\`]${value}["'\`]`);
      for (const source of appSources()) {
        if (raw.test(source.text)) offenders.push(`${normalise(source.file)} (${name})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});



