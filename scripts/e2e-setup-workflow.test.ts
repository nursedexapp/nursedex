// @vitest-environment node
//
// The E2E job's setup: what it starts (#802) and what it downloads (#804).
//
// Both changes have the same failure shape. An exclusion name the CLI does not
// recognise is silently ignored, and a cache key that stops tracking the
// Playwright version silently serves a stale browser. Neither fails; both just
// stop working while every check stays green.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkExclusions } from "./supabase-exclusions";

const E2E = readFileSync(
  join(process.cwd(), ".github/workflows/e2e.yml"),
  "utf8",
);

/**
 * Comments explain the workflow; only executed lines start a service or
 * download a browser. Several comments here name the very commands they exist
 * to say were removed, and a check over the raw file cannot tell the line
 * doing a thing from the line explaining it (L103, L135).
 */
const EXECUTABLE = E2E.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

const LOCKFILE = JSON.parse(
  readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
) as { packages?: Record<string, { version?: string } | undefined> };

/** The services the workflow actually asks to exclude. */
function excludedInWorkflow(): string[] {
  const match = E2E.match(/EXCLUDED_SERVICES: >-\n((?:\s+[^\n]*\n)+?)\s*run:/);
  if (!match) throw new Error("no EXCLUDED_SERVICES block in e2e.yml");
  return match[1].split(/[\s,]+/).filter((name) => name.length > 0);
}

describe("what the E2E job starts (#802)", () => {
  // Run against the workflow's real list with the same function CI uses. A
  // second copy of the rule written here would drift from the one that
  // actually runs (L263).
  it("excludes nothing the suite itself uses", () => {
    expect(() => checkExclusions(excludedInWorkflow())).not.toThrow();
  });

  it("excludes the seven services identified as unreachable", () => {
    expect(excludedInWorkflow().sort()).toEqual(
      [
        "edge-runtime",
        "logflare",
        "mailpit",
        "postgres-meta",
        "realtime",
        "studio",
        "vector",
      ].sort(),
    );
  });

  // Storage holds nurse photos and blog images. Excluding it would be accepted
  // by the CLI and would break the suite, which is why it is named here as
  // well as in the checker.
  it("keeps storage running", () => {
    expect(excludedInWorkflow()).not.toContain("storage-api");
  });

  // The check that matters happens AFTER the stack starts: a name --exclude
  // does not recognise is silently ignored, so only what ended up running can
  // tell you whether the exclusions took effect.
  it("counts what is actually running once the stack is up", () => {
    expect(E2E).toMatch(/docker ps --filter name=supabase/);
    expect(E2E).toMatch(/check-supabase-exclusions\.ts count/);
  });

  it("checks the list before starting, as well", () => {
    expect(E2E).toMatch(/check-supabase-exclusions\.ts check/);
  });

  // The previous version asked the CLI which names it accepted, by parsing its
  // help. That broke on the first run, because the runner's CLI prints that
  // list differently. Nothing should couple to it again.
  it("does not depend on how the CLI words its help", () => {
    expect(EXECUTABLE).not.toMatch(/supabase start --help/);
  });

  it("fails the step when either check fails, rather than carrying on", () => {
    expect(E2E).toMatch(/set -euo pipefail\n\s+exclude=\$\(npx tsx/);
  });
});

describe("what the E2E job downloads (#804)", () => {
  it("caches the browser directory Playwright actually installs into", () => {
    expect(E2E).toMatch(/path:\s*~\/\.cache\/ms-playwright/);
  });

  // A key that stops tracking the version serves whatever browser was cached
  // first, forever, against a Playwright that has since moved.
  it("keys the cache on the resolved Playwright version, not a literal", () => {
    expect(E2E).toMatch(
      /key:\s*ms-playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.playwright\.outputs\.version \}\}/,
    );
    const version = LOCKFILE.packages?.["node_modules/@playwright/test"]?.version;
    expect(typeof version).toBe("string");
    expect(E2E).not.toContain(`ms-playwright-${version}`);
  });

  it("reads that version from the lockfile", () => {
    expect(E2E).toMatch(
      /node -p "require\('\.\/package-lock\.json'\)\.packages\['node_modules\/@playwright\/test'\]\.version"/,
    );
  });

  // --with-deps installs system packages that live outside the cached
  // directory, so it has to run on a cache hit too.
  it("still installs system dependencies when the browser is cached", () => {
    expect(E2E).toMatch(/playwright install --with-deps chromium/);
  });
});

describe("how many times the E2E job builds the database (#803)", () => {
  /** Steps whose command applies migrations and the seed. */
  function applyingSteps(): string[] {
    return EXECUTABLE.split(/\n(?=      - name: )/)
      .filter((step) => /supabase (start|db reset)/.test(step))
      .map((step) => step.match(/- name: (.+)/)![1].trim());
  }

  // `supabase start` on a fresh runner already applies all 65 migrations and
  // the seed; `supabase db reset` then did the identical work again, 32 to 38
  // seconds per run. Counted rather than named, so a third way of building the
  // database added later is caught too (L96).
  it("builds it exactly once", () => {
    expect(applyingSteps()).toEqual(["Start Supabase"]);
  });

  // The reset step was credited with surfacing a broken migration. It was
  // dropped only after a branch carrying one (#821) made `supabase start`
  // fail, naming the migration and the SQL error, with reset never running.
  it("does not reset the database it has just built", () => {
    expect(EXECUTABLE).not.toMatch(/supabase db reset/);
  });
});
