// @vitest-environment node
//
// Wiring test for the third party health workflow (#796).
//
// The workflow cannot run here, so this pins what makes it worth having: it
// runs on its own schedule, it runs the four live service checks, it carries
// the credentials they need, and a failure reaches Slack rather than sitting
// in an Actions tab nobody opens.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCronSchedules } from "./scheduled-jobs";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/health-checks.yml"),
  "utf8",
);

const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("third party health workflow", () => {
  it("runs on a schedule of its own", () => {
    expect(parseCronSchedules(WORKFLOW).length).toBeGreaterThan(0);
  });

  it("can be triggered by hand", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("runs the health services command", () => {
    expect(EXECUTABLE).toMatch(/npm run test:health:services/);
    expect(packageJson.scripts["test:health:services"]).toBeTruthy();
  });

  /**
   * The command names four files. If one is renamed or a fifth service check is
   * added and left out, the job still passes while checking less than it claims
   * (L98). This asserts the count so that goes red instead.
   */
  it("names every live service check that exists", () => {
    const named =
      packageJson.scripts["test:health:services"].match(
        /src\/lib\/__tests__\/[\w.-]+\.test\.ts/g,
      ) ?? [];
    expect(named.length).toBe(4);
    for (const file of named) {
      expect(() => readFileSync(file, "utf8")).not.toThrow();
    }
  });

  /**
   * Every credential the four checks read has to be in the step's environment.
   * A missing one does not skip the check, it fails it, which is correct but
   * reads as a broken service rather than a missing secret, so the list is
   * pinned here where it can be compared against the checks themselves.
   */
  it.each([
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "RESEND_API_KEY",
    "SENTRY_DSN",
  ])("passes %s from secrets, never from a literal", (name) => {
    expect(EXECUTABLE).toMatch(
      new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`),
    );
  });

  it("posts the failure to Slack, since nobody is watching a scheduled run", () => {
    expect(EXECUTABLE).toMatch(/announce-ci-failure\.ts/);
    expect(EXECUTABLE).toMatch(/if:\s*failure\(\)/);
    expect(EXECUTABLE).toMatch(/SLACK_BOT_TOKEN:\s*\$\{\{\s*secrets\./);
  });

  /**
   * The alert carries the log, so the log has to survive the step that failed.
   * Without pipefail the tee would swallow the runner's non-zero exit and the
   * job would go green on a failing suite (L183 in reverse: here the pipeline
   * must fail, not the producer).
   */
  it("keeps the log and still fails when the checks fail", () => {
    expect(EXECUTABLE).toMatch(/set -o pipefail/);
    expect(EXECUTABLE).toMatch(/tee health-checks\.log/);
  });
});
