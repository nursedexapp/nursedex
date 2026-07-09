// @vitest-environment node
//
// Wiring test for the migration drift workflow (#518).
//
// The workflow itself cannot run in CI, so these tests pin the properties that
// make it useful and safe: it runs on a schedule AND after merges, it invokes
// the drift checker, and above all it never applies migrations.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/migration-drift.yml"),
  "utf8",
);

/** Comment lines explain the workflow; only executed lines can do damage. */
const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("migration-drift workflow", () => {
  it("runs right after a merge to main, when a forgotten migration is most likely", () => {
    expect(WORKFLOW).toMatch(/push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
  });

  it("runs on a daily schedule as a backstop", () => {
    expect(WORKFLOW).toMatch(/schedule:\s*\n\s*-\s*cron:/);
  });

  it("can be triggered by hand", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("pipes the CLI's JSON output through the drift checker", () => {
    expect(WORKFLOW).toMatch(/migration list --linked --output-format json/);
    expect(WORKFLOW).toMatch(/scripts\/check-migration-drift\.ts/);
  });

  it("never applies migrations: detection only, no writes", () => {
    // The whole point is a read-only signal. An accidental `db push` here
    // would hand CI unattended write access to the production schema, which is
    // exactly the blast radius #542 says must stay behind a human gate.
    expect(EXECUTABLE).not.toMatch(/db\s+push/);
    expect(EXECUTABLE).not.toMatch(/db\s+reset/);
  });

  it("fails the step when any command in the pipeline fails", () => {
    // Without pipefail, a failing `supabase migration list` would let the
    // pipeline's exit status come from the checker reading empty stdin.
    expect(WORKFLOW).toMatch(/set -euo pipefail/);
  });

  it("reads its production credentials from secrets, never from literals", () => {
    expect(WORKFLOW).toMatch(/SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\./);
    expect(WORKFLOW).toMatch(/SUPABASE_DB_PASSWORD:\s*\$\{\{\s*secrets\./);
    expect(WORKFLOW).toMatch(/PROJECT_REF:\s*\$\{\{\s*secrets\./);
  });
});
