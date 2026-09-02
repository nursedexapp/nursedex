// @vitest-environment node
//
// Jobs whose whole job is to run one TypeScript script used to run `npm ci`
// first (22 to 38 seconds) to rebuild the entire dependency tree for it, which
// pushed Production Smoke just over the billed minute on every one of its 48
// monthly runs (#808).
//
// They now install tsx alone through one composite action. These tests cover
// the action (where the saving lives) and the workflows that use it (where it
// would silently stop applying).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ACTION = ".github/actions/setup-tsx/action.yml";

/** Workflows whose only dependency is tsx, so none of them may install more. */
const LEAN_WORKFLOWS = [
  ".github/workflows/migration-drift.yml",
  ".github/workflows/prod-smoke.yml",
  ".github/workflows/job-watchdog.yml",
] as const;

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** Comments explain a workflow; only executed lines install anything. */
function executable(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/**
 * The lockfile's tsx version, read independently of the action. Comparing the
 * action's own expression against a value derived by that same expression would
 * only prove the expression is self-consistent, never that it is right (L70).
 *
 * It refuses rather than returning undefined: an undefined expected value
 * compares false against every actual one, so the version test would fail with
 * a message about the action when the fault is in this reader (L50, L11).
 */
function lockedTsxVersion(): string {
  const lockfile = JSON.parse(read("package-lock.json")) as {
    packages?: Record<string, { version?: string } | undefined>;
  };
  const version = lockfile.packages?.["node_modules/tsx"]?.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(
      "package-lock.json has no version for node_modules/tsx, so there is " +
        "nothing to pin the setup-tsx action against. Fix the lockfile, not " +
        "the action.",
    );
  }
  return version;
}

const LOCKED_TSX_VERSION = lockedTsxVersion();

describe("the setup-tsx composite action", () => {
  const code = executable(read(ACTION));

  it("installs tsx without writing it into package.json", () => {
    expect(code).toMatch(/npm\s+install\s[^\n]*--no-save/);
    expect(code).toMatch(/tsx@/);
  });

  // The whole saving lives in this flag. `npm install tsx@x` run inside the
  // repo installs everything in package.json as well: measured at 1171
  // packages and 14 seconds against 5 packages and 4 seconds, so without
  // --prefix this saves nothing while looking exactly like it does (L102).
  it("installs outside the repo, where there is no package.json to expand", () => {
    expect(code).toMatch(/npm\s+install\s[^\n]*--prefix\s+"\$RUNNER_TEMP/);
  });

  it("puts that install on PATH so the calling job can find it", () => {
    expect(code).toMatch(/RUNNER_TEMP\/tsx\/node_modules\/\.bin"?\s*>>\s*"\$GITHUB_PATH"/);
  });

  // L41: a version maintained by hand beside the lockfile drifts from it
  // silently, and the drift is invisible because the job goes on passing
  // against whatever tsx it happened to install.
  it("takes the tsx version from the lockfile, never from a literal", () => {
    expect(code).not.toMatch(/tsx@\d/);
    expect(code).toMatch(/package-lock\.json/);
  });

  it("resolves that version to the one the lockfile actually holds", () => {
    // Run the action's own derivation, so this fails if the expression is
    // edited into something that no longer names tsx.
    const expression = code.match(
      /node -p "(require\('\.\/package-lock\.json'\)[^"]*)"/,
    );
    expect(expression, "no lockfile-reading node -p expression found").not.toBeNull();

    const resolved = execFileSync("node", ["-p", expression![1]], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    expect(resolved).toBe(LOCKED_TSX_VERSION);
  });

  // Without pipefail a failed derivation would still let the install run, and
  // npm would install whatever `tsx@` alone means, which is latest.
  it("fails the step when the derivation fails", () => {
    expect(code).toMatch(/set -euo pipefail\n\s+version=/);
  });
});

describe.each(LEAN_WORKFLOWS)("%s installs only what it runs", (workflow) => {
  const code = executable(read(workflow));

  it("does not rebuild the whole dependency tree", () => {
    expect(code).not.toMatch(/npm\s+ci\b/);
  });

  // A workflow that stopped using the action and grew its own install would
  // pass every assertion above, because those are about the action.
  it("gets tsx from the one shared action", () => {
    expect(code).toMatch(/uses:\s*\.\/\.github\/actions\/setup-tsx/);
  });

  // `npx tsx` would resolve nothing locally now and fetch tsx from the
  // registry at whatever version is latest that day, defeating the pin.
  it("runs its checker through the installed tsx, not through npx", () => {
    expect(code).toMatch(/(?<!npx )tsx scripts\/check-[a-z-]+\.ts/);
    expect(code).not.toMatch(/npx\s+tsx/);
  });
});
