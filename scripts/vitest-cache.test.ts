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
import { readFileSync } from "node:fs";
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

  // That vitest HONOURS this directory is not asserted here, deliberately.
  //
  // Two earlier attempts were both wrong. The first demanded that
  // node_modules/.vite be absent, which is a fact about whatever else has run
  // on the machine rather than about the code. The second looked for vitest's
  // results.json inside the directory, which vitest writes at the END of a
  // run: this test executes during that run, so it was reading the PREVIOUS
  // run's artifact and would have failed on CI's first, cold run.
  //
  // A unit test cannot observe the side effect of the run it is part of. The
  // check lives in ci.yml instead, after the suite, where the directory can be
  // inspected once vitest has finished with it.
  it("is checked for real by the workflow, after the suite has run", () => {
    expect(CI).toContain("Check vitest used its cache directory");
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
  //
  // The step is found by what it DOES (an actions/cache step whose path is the
  // configured directory), not by its name. An earlier version matched the name
  // and broke the moment the step was renamed to describe the cache correctly,
  // which is a test coupled to wording rather than to behaviour (L103).
  it("restores the cache before the install, not after", () => {
    const dir = configuredCacheDir();
    const steps = CI.split(/\n(?=      - name: )/);
    const cacheAt = steps.findIndex(
      (step) => step.includes("actions/cache@") && step.includes(`path: ${dir}`),
    );
    const installAt = steps.findIndex((step) =>
      step.includes("- name: Install dependencies"),
    );
    expect(cacheAt, "no actions/cache step for the vitest directory").toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeLessThan(installAt);
  });
});
