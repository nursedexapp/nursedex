// @vitest-environment node
//
// Wiring test for the schema contents comparison (#890).
//
// The job cannot run here, so this pins what makes it worth having: both sides
// come from ONE query file, the expected side is built from the migrations
// rather than written down, and the job is separate from the version
// comparison beside it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/migration-drift.yml"),
  "utf8",
);

const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

const SHAPE_QUERY = readFileSync(
  join(process.cwd(), "scripts/schema-shape.sql"),
  "utf8",
);

describe("the schema contents job", () => {
  it("is its own job, not a step on the version comparison", () => {
    // A failure of one must not hide the other: a migration that never ran and
    // one that ran wrong need different work, and one job reporting both would
    // stop at whichever failed first (L73).
    expect(EXECUTABLE).toMatch(/^ {2}drift:$/m);
    expect(EXECUTABLE).toMatch(/^ {2}contents:$/m);
  });

  it("builds the expected shape from the migrations rather than a written list", () => {
    // The whole design. A hand kept list of expected columns is the same
    // defect one level up, and it would drift silently.
    expect(EXECUTABLE).toMatch(/supabase start/);
    expect(EXECUTABLE).toMatch(/supabase db query --local/);
  });

  it("reads production through the same query file, not a second one", () => {
    // Two queries would be two definitions of "the shape", and they would
    // drift apart in exactly the way this job exists to catch (L70).
    const uses = EXECUTABLE.match(/scripts\/schema-shape\.sql/g) ?? [];
    expect(uses.length).toBe(2);
    expect(EXECUTABLE).toMatch(/supabase db query --linked/);
  });

  it("carries the credentials for reading production", () => {
    expect(EXECUTABLE).toMatch(/SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\./);
    expect(EXECUTABLE).toMatch(/SUPABASE_DB_PASSWORD:\s*\$\{\{\s*secrets\./);
    expect(EXECUTABLE).toMatch(/SUPABASE_PROJECT_REF\s*\}\}/);
  });

  it("passes the Slack token, so a difference reaches somebody", () => {
    expect(EXECUTABLE).toMatch(/SLACK_BOT_TOKEN:\s*\$\{\{\s*secrets\./);
  });

  it("carries a timeout", () => {
    // Two of them now: without one a job inherits GitHub's six hour default,
    // and this one starts a container stack that can hang on an image pull.
    const timeouts = EXECUTABLE.match(/timeout-minutes:/g) ?? [];
    expect(timeouts.length).toBe(2);
  });

  it("runs the comparison, and not with enforcement switched on yet", () => {
    // Shipped observing on purpose (L56), tracked by #1031 (L65). This asserts
    // the switch is NOT set, so turning it on is a deliberate edit rather than
    // something that happens by being forgotten in either direction.
    expect(EXECUTABLE).toMatch(/scripts\/check-schema-drift\.ts/);
    expect(EXECUTABLE).not.toMatch(/SCHEMA_DRIFT_ENFORCE:\s*["']?1/);
  });
});

describe("the shape query", () => {
  it("asks about every kind of fact a migration can change", () => {
    // A kind left out is a kind that can drift with nothing reporting it, and
    // the check would go on reading as a full comparison.
    for (const kind of [
      "'column'",
      "'index'",
      "'constraint'",
      "'enum'",
      "'rls'",
      "'policy'",
    ]) {
      expect(SHAPE_QUERY).toContain(kind);
    }
  });

  it("is scoped to the public schema", () => {
    // Without this it would compare Supabase's own internal schemas, which
    // differ between a hosted project and a local one for reasons that are
    // nobody's defect.
    expect(SHAPE_QUERY).toMatch(/public/);
  });

  it("reads only, so it is safe to point at production", () => {
    for (const write of [
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+\w/i,
      /\bDELETE\s+FROM\b/i,
      /\bDROP\b/i,
      /\bALTER\b/i,
      /\bCREATE\b/i,
      /\bGRANT\b/i,
    ]) {
      expect(
        SHAPE_QUERY,
        `${write} in a query that runs against production`,
      ).not.toMatch(write);
    }
  });

  it("opens with a block comment, so the CLI cannot read it as a flag", () => {
    // An argument starting with -- is read as a flag. The neighbouring
    // prod-smoke.sql carries the same note for the same reason.
    expect(SHAPE_QUERY.trimStart().startsWith("/*")).toBe(true);
  });
});
