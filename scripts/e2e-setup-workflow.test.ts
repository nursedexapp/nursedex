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
import { parseAcceptedExclusions, checkExclusions } from "./supabase-exclusions";

const E2E = readFileSync(
  join(process.cwd(), ".github/workflows/e2e.yml"),
  "utf8",
);

const LOCKFILE = JSON.parse(
  readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
) as { packages?: Record<string, { version?: string } | undefined> };

// From `supabase start --help` on CLI 2.75.0.
const ACCEPTED = parseAcceptedExclusions(
  "  -x, --exclude strings       Names of containers to not start. " +
    "[gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest," +
    "postgres-meta,studio,edge-runtime,logflare,vector,supavisor]",
);

/** The services the workflow actually asks to exclude. */
function excludedInWorkflow(): string[] {
  const match = E2E.match(/EXCLUDED_SERVICES: >-\n((?:\s+[^\n]*\n)+?)\s*run:/);
  if (!match) throw new Error("no EXCLUDED_SERVICES block in e2e.yml");
  return match[1].split(/[\s,]+/).filter((name) => name.length > 0);
}

describe("what the E2E job starts (#802)", () => {
  // The real check, run against the workflow's real list with the same
  // function CI uses. A second copy of the rule written here would drift from
  // the one that actually runs (L263).
  it("excludes only names the CLI accepts and the suite does not use", () => {
    expect(() => checkExclusions(excludedInWorkflow(), ACCEPTED)).not.toThrow();
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

  // Checking the names is the whole point: without it a typo excludes nothing
  // and the step looks identical to a working one.
  it("checks the names against the CLI before using them", () => {
    expect(E2E).toContain("scripts/check-supabase-exclusions.ts");
    expect(E2E).toMatch(/supabase start --help/);
  });

  it("fails the step when the check fails, rather than starting everything", () => {
    expect(E2E).toMatch(/set -euo pipefail\n\s+exclude=\$\(supabase start --help/);
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
  // Comments explain the workflow; only executed lines build a database. The
  // comment recording WHY reset was dropped names the command it dropped, and
  // a check over the raw file cannot tell that line from a line that runs it.
  const EXECUTABLE = E2E.split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

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
