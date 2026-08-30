// @vitest-environment node
//
// Vitest keeps two things in its cache directory: the transform cache, and the
// results store it uses to order test files slowest first. Both default to
// node_modules/.vite, which `npm ci` deletes on every CI run, so the runner
// re-transformed everything and ordered by file size every time (#811). The
// ordering is what a four core runner needs most.
//
// Moving the directory is only half of it. A cache that is configured but not
// preserved, or preserved but not actually written to, fails silently: it is
// simply slower, and every check stays green (L289, L322).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONFIG = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
const CI = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const IGNORE = readFileSync(join(process.cwd(), ".gitignore"), "utf8");

/** The cacheDir the config actually sets. */
function configuredCacheDir(): string {
  const match = CONFIG.match(/^\s*cacheDir:\s*"([^"]+)"/m);
  expect(match, "vitest.config.ts sets no cacheDir").not.toBeNull();
  return match![1];
}

describe("the vitest cache directory", () => {
  it("is set, and is outside node_modules", () => {
    const dir = configuredCacheDir();
    expect(dir).not.toMatch(/node_modules/);
  });

  // Measured rather than assumed: a tool only honours a directory setting if
  // it actually writes there, and the whole change is worthless otherwise
  // (L322). The suite that just ran wrote this.
  //
  // Asserted by finding vitest's own results store inside the directory, not
  // by demanding node_modules/.vite be absent. That absence is a fact about
  // whatever else has run on this machine, so asserting it makes the test
  // depend on ambient state rather than on the code: a leftover directory from
  // an older checkout would fail it, which it did while this file was being
  // written.
  it("is where vitest actually writes, not merely where it was told to", () => {
    const dir = join(process.cwd(), configuredCacheDir());
    expect(
      existsSync(dir),
      `${configuredCacheDir()} does not exist after a run, so vitest is not using it`,
    ).toBe(true);

    const results = readdirSync(join(dir, "vitest"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .some((entry) => existsSync(join(dir, "vitest", entry.name, "results.json")));
    expect(
      results,
      "no results.json under the cache directory, so the ordering store is not landing there",
    ).toBe(true);
  });

  it("is ignored by git, since it is a build artefact", () => {
    expect(IGNORE).toContain(configuredCacheDir());
  });
});

describe("the CI cache step", () => {
  it("preserves exactly the directory the config names", () => {
    const dir = configuredCacheDir();
    expect(CI).toMatch(new RegExp(`path:\\s*${dir}\\b`));
  });

  // Keyed on what invalidates a transform. A key that never changes serves a
  // stale cache forever; one that changes on every commit never hits.
  it("keys the cache on the lockfile and the vitest config", () => {
    expect(CI).toMatch(/hashFiles\('package-lock\.json', 'vitest\.config\.ts'\)/);
  });

  it("falls back to a partial key, because a stale cache is still most of the work", () => {
    expect(CI).toMatch(/restore-keys:/);
  });

  // It has to be restored BEFORE the install, or npm ci would run first and
  // the ordering the cache exists to restore would arrive too late to matter.
  it("restores the cache before the install, not after", () => {
    const cacheAt = CI.indexOf("Cache the vitest transform");
    const installAt = CI.indexOf("- name: Install dependencies");
    expect(cacheAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeLessThan(installAt);
  });
});
