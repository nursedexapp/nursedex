import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every test file has a command that runs it, and that command runs in CI.
 *
 * Four commands exist here and they do not overlap:
 *
 *   npm test                    vitest.config.ts, which EXCLUDES src/lib/__tests__
 *   npm run test:rls            a listed subset of src/lib/__tests__
 *   npm run test:health:services the live third party checks
 *   npm run test:health         the whole of src/lib/__tests__
 *
 * A file dropped into src/lib/__tests__ and named by no command is executed by
 * nothing, and its absence looks exactly like a pass (#778).
 *
 * Which commands COUNT is derived from the workflow files rather than listed
 * here, so wiring a command into a workflow is what makes it count, and a
 * command that exists in package.json but runs in no workflow protects nothing
 * (#796, L96).
 */

const HEALTH_DIR = join("src", "lib", "__tests__");

/**
 * Files in that directory that deliberately run NOWHERE in CI, and why.
 *
 * The four third party health checks used to live here. They came out as part
 * of #796: a check that only runs when somebody happens to run it by hand is
 * not a check on anything, and email that silently stops sending looks exactly
 * like nobody signing up. They now run daily in health-checks.yml.
 *
 * Declaring the remainder here is the point: a new file in that directory has
 * to be either wired into a command CI runs or declared local-only on purpose,
 * instead of quietly executing nowhere.
 */
const LOCAL_ONLY: Record<string, string> = {
  "src/lib/__tests__/distance-function.test.ts":
    "calls the calculate_distance function on a live database, which CI has no route to",
};

/**
 * The npm scripts the workflows actually invoke.
 *
 * Read out of the workflow files, because a script in package.json that no
 * workflow runs executes nowhere, and a guard that trusted package.json alone
 * would call such a file covered (L96, L3).
 */
function scriptsRunInCi(): string[] {
  const dir = ".github/workflows";
  const names = new Set<string>();

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yml"))) {
    const contents = readFileSync(join(dir, file), "utf8");
    for (const line of contents.split("\n")) {
      if (line.trim().startsWith("#")) continue;
      for (const match of line.matchAll(/npm run ([\w:-]+)/g)) {
        names.add(match[1]);
      }
      if (/npm test\b/.test(line)) names.add("test");
    }
  }

  return [...names];
}

/** The command strings behind the scripts CI runs. */
function ciCommands(scripts: Record<string, string>): string[] {
  return scriptsRunInCi()
    .map((name) => scripts[name])
    .filter((command): command is string => Boolean(command));
}

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
  const commands = ciCommands(packageJson.scripts);

  it("exist, so this guard is not checking an empty list", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(rlsScript).toBeTruthy();
  });

  it("finds the commands CI runs, so it is not checking against an empty list", () => {
    // Without this, a workflow rename would leave every health file matched
    // against nothing, and the failure would read as "wire this up" on files
    // that are already wired (L98).
    expect(commands.length).toBeGreaterThan(1);
  });

  it.each(files)(
    "%s has a command that runs it in CI, or a stated reason",
    (file) => {
      // The command uses forward slashes whatever platform assembled the path.
      const asScript = file.split(/[\\/]/).join("/");
      if (asScript in LOCAL_ONLY) {
        expect(LOCAL_ONLY[asScript].length).toBeGreaterThan(10);
        return;
      }
      expect(
        commands.some((command) => command.includes(asScript)),
        `${asScript} lives in ${HEALTH_DIR}, which "npm test" excludes, and no ` +
          `npm script that a workflow runs names it. It would execute nowhere. ` +
          `Add it to one of those commands, or to LOCAL_ONLY with a reason.`,
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
