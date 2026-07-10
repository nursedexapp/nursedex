// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

// #584: the no-direct-secret-comparison guard was scoped to src/**, so a direct
// secret comparison written in scripts/ (real code that runs in CI and touches
// production credentials) shipped unguarded. This exercises the REAL project
// config, not a hand-built one, so the test fails if the guard ever narrows
// back to src/ only.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");
const configPath = path.join(repoRoot, "eslint.config.mjs");

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configPath });
});

const SECRET_COMPARISON = `if (token === process.env.CRON_SECRET) {}\n`;

/** Rule ids reported by the real config for a snippet at the given path. */
async function ruleIdsFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

describe("eslint.config.mjs coverage of the secret-comparison guard", () => {
  it("flags a direct secret comparison in scripts/", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "scripts/example-check.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("flags a direct secret comparison in e2e/", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "e2e/example.spec.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("still flags a direct secret comparison in src/ (no regression)", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "src/app/api/example/route.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("does not flag a public NEXT_PUBLIC_ key comparison in scripts/", async () => {
    const ids = await ruleIdsFor(
      `if (k === process.env.NEXT_PUBLIC_POSTHOG_KEY) {}\n`,
      path.join(repoRoot, "scripts/example-check.ts"),
    );
    expect(ids).not.toContain("local/no-direct-secret-comparison");
  });
});
