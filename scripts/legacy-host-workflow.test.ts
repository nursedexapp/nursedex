// @vitest-environment node
//
// Wiring test for the legacy Supabase host check (#744).
//
// The check rides in the existing Production Smoke workflow rather than a second
// scheduled one, because it needs exactly the same secrets and the same cadence,
// and two workflows watching production is one more thing to keep in step.
//
// These tests pin the properties that make it actually fire. A guard that is
// written but never executed is the failure mode this whole issue exists to
// prevent: the repo already has four *-health.test.ts files under
// src/lib/__tests__ that no workflow runs at all.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/prod-smoke.yml"),
  "utf8",
);

const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("legacy host check wiring", () => {
  it("is actually invoked by the workflow", () => {
    expect(EXECUTABLE).toContain("scripts/legacy-host.sql");
    expect(EXECUTABLE).toContain("scripts/check-legacy-host.ts");
  });

  it("runs even when the grants step above it has already failed", () => {
    // Two independent questions about production share this one job. Without an
    // always() boundary the first failure hides the second, and the run that
    // most needs both answers is the one that gets one.
    const step = EXECUTABLE.slice(EXECUTABLE.indexOf("Legacy Supabase host"));
    expect(step).toMatch(/if:\s*always\(\)/);
  });

  it("can reach Slack, so a failure is not only a red tick nobody watches", () => {
    const step = EXECUTABLE.slice(EXECUTABLE.indexOf("Legacy Supabase host"));
    expect(step).toContain("SLACK_BOT_TOKEN");
  });

  it("never writes to production", () => {
    // The same rule the grants check holds itself to. A watcher that mutates
    // what it watches is worse than no watcher.
    expect(EXECUTABLE).not.toMatch(/\bdb push\b/);
    expect(EXECUTABLE).not.toMatch(/\b(insert|update|delete|drop|truncate)\s+/i);
  });

  it("checks a real stored image, not a hardcoded URL that can rot", () => {
    // The SQL reads live rows. A literal URL pinned in the workflow would keep
    // passing after the post behind it was deleted, and keep failing after a
    // legitimate change, neither of which says anything about the host.
    const sql = readFileSync(
      join(process.cwd(), "scripts/legacy-host.sql"),
      "utf8",
    );
    expect(sql).toMatch(/from\s+public\.blog_posts/i);
    expect(sql).toMatch(/cover_image_url/);
    expect(sql).not.toMatch(/https:\/\//);
  });
});
