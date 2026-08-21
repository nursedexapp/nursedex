import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every test file has a command that runs it, and that command runs in CI.
 *
 * Three of them exist here and they do not overlap:
 *
 *   npm test            vitest.config.ts, which EXCLUDES src/lib/__tests__
 *   npm run test:rls    a hand-listed subset of src/lib/__tests__
 *   npm run test:health the whole of src/lib/__tests__
 *
 * `npm test` runs in ci.yml and `npm run test:rls` in e2e.yml. `test:health`
 * runs in no workflow at all. So a guard dropped into src/lib/__tests__ and
 * not added to the test:rls list is executed by nothing, and its absence looks
 * exactly like a pass (#778).
 *
 * That list is a registry maintained by hand, which checks only what it lists.
 * This derives both sides from the files and from package.json, so a new file
 * there fails until it is wired into a command CI actually runs.
 */

const HEALTH_DIR = join("src", "lib", "__tests__");

/**
 * Files in that directory that deliberately run NOWHERE in CI, and why.
 *
 * Each reads .env.local and talks to a live third party service, so it is a
 * local diagnostic rather than a guard. Declaring them here is the point: a
 * new file in that directory now has to be either wired into test:rls or
 * declared local-only on purpose, instead of quietly executing nowhere.
 */
const LOCAL_ONLY: Record<string, string> = {
  "src/lib/__tests__/distance-function.test.ts":
    "calls the calculate_distance function on a live database",
  "src/lib/__tests__/posthog-health.test.ts": "pings the live PostHog project",
  "src/lib/__tests__/resend-health.test.ts": "pings the live Resend account",
  "src/lib/__tests__/sentry-health.test.ts": "pings the live Sentry project",
  "src/lib/__tests__/supabase-health.test.ts":
    "pings the live Supabase project",
};

function testFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...testFilesUnder(full));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("the health tests", () => {
  const files = testFilesUnder(HEALTH_DIR);
  const rlsScript = packageJson.scripts["test:rls"];

  it("exist, so this guard is not checking an empty list", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(rlsScript).toBeTruthy();
  });

  it.each(files)(
    "%s has a command that runs it, or a stated reason",
    (file) => {
      // The command uses forward slashes whatever platform assembled the path.
      const asScript = file.split(/[\\/]/).join("/");
      if (asScript in LOCAL_ONLY) {
        expect(LOCAL_ONLY[asScript].length).toBeGreaterThan(10);
        return;
      }
      expect(
        rlsScript.includes(asScript),
        `${asScript} lives in ${HEALTH_DIR}, which "npm test" excludes, and is ` +
          `not in the test:rls command that CI runs. It would execute nowhere. ` +
          `Add it to that command, or to LOCAL_ONLY with a reason.`,
      ).toBe(true);
    },
  );

  // The exception list is itself a registry, so it must not outlive its files.
  it("declares no local-only file that no longer exists", () => {
    const present = new Set(files.map((f) => f.split(/[\\/]/).join("/")));
    for (const declared of Object.keys(LOCAL_ONLY)) {
      expect(present.has(declared), `${declared} is declared but gone`).toBe(
        true,
      );
    }
  });

  it("names every file the test:rls command lists", () => {
    // The other direction: a command naming a file that was deleted or
    // renamed passes vacuously, running fewer guards than it claims to.
    const named =
      rlsScript.match(/src\/lib\/__tests__\/[\w.-]+\.test\.ts/g) ?? [];
    const present = new Set(files.map((f) => f.split(/[\\/]/).join("/")));
    for (const file of named) {
      expect(present.has(file), `test:rls names ${file}, which is gone`).toBe(
        true,
      );
    }
    expect(named.length).toBeGreaterThan(0);
  });

  it("is the only directory npm test excludes", () => {
    const config = readFileSync("vitest.config.ts", "utf8");
    const excludes = config.match(/exclude:\s*\[([^\]]*)\]/)?.[1];
    expect(excludes, "vitest.config.ts has no exclude list").toBeTruthy();
    const entries = (excludes!.match(/"([^"]+)"/g) ?? []).map((s) =>
      s.replace(/"/g, ""),
    );
    expect(entries).toEqual(["src/lib/__tests__/**"]);
  });
});

describe("the e2e specs", () => {
  // A spec that skips itself when its environment is absent reports a pass.
  // That is fine for one that genuinely cannot run outside the e2e job, but it
  // has to be a deliberate, named exception rather than a habit.
  const SELF_SKIPPING = ["e2e/data-api.spec.ts"];

  it.each(
    readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => join("e2e", f)),
  )("%s skips itself only if it is a named exception", (file) => {
    const source = readFileSync(file, "utf8");
    const skipsItself = /test\.skip\(\s*!/.test(source);
    if (!skipsItself) return;
    expect(
      SELF_SKIPPING.map((s) => s.split(/[\\/]/).join("/")),
      `${file} skips itself when its environment is absent, which reads as a ` +
        `pass. Add it to SELF_SKIPPING with a reason, or make it fail loudly.`,
    ).toContain(file.split(/[\\/]/).join("/"));
  });
});
