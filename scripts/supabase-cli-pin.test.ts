// @vitest-environment node
//
// Every workflow installs ONE exact Supabase CLI version, through ONE
// setup-cli major (#408).
//
// `version: latest` let a vendor's release calendar change CI with nobody
// here making a change. On 2026-11-02 Supabase shipped CLI v3.0.0 at 12:18
// UTC; the 22:08 UTC Migration Drift run installed it unasked and failed both
// jobs: `supabase start` rejected the `[inbucket]` section of config.toml, and
// `migration list` printed a payload the parser no longer recognised. The
// check refused rather than reporting an all clear, which held every release
// behind it. The same class broke every e2e query once before (#354).
//
// So a CLI bump is a pull request: change the version below and in every
// workflow together, and watch the drift and prod smoke runs after merge,
// since neither runs on a pull request.
//
// This asks the DIRECTORY, not a list of files, so a new workflow that
// installs the CLI is covered the day it is added (L96).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

/** The one CLI version CI runs. Bump it here and in every workflow at once. */
const PINNED_CLI = "2.122.0";
const ACTION_MAJOR = "v3";

type Install = { workflow: string; line: number; action: string; version: string | null };

/**
 * Every `supabase/setup-cli` step in every workflow, with the `version` input
 * read from the lines of that same step (up to the next step or job).
 */
function installs(): Install[] {
  const found: Install[] = [];
  for (const workflow of readdirSync(DIR).filter((f) => f.endsWith(".yml"))) {
    const lines = readFileSync(join(DIR, workflow), "utf8").split("\n");
    lines.forEach((text, i) => {
      const uses = text.match(/uses:\s*supabase\/setup-cli@(\S+)/);
      if (!uses) return;
      let version: string | null = null;
      for (const next of lines.slice(i + 1)) {
        if (/^\s*- /.test(next) || /^ {2}[A-Za-z0-9_-]+:\s*$/.test(next)) break;
        const v = next.match(/^\s+version:\s*(\S+)/);
        if (v) version = v[1].replace(/^["']|["']$/g, "");
      }
      found.push({ workflow, line: i + 1, action: uses[1], version });
    });
  }
  return found;
}

describe("Supabase CLI pin (#408)", () => {
  const all = installs();

  it("finds the CLI installs it is meant to guard", () => {
    // A scan that matches nothing passes every assertion below (L100).
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("installs the pinned CLI version everywhere, never latest", () => {
    const wrong = all
      .filter((i) => i.version !== PINNED_CLI)
      .map((i) => `${i.workflow}:${i.line} version ${i.version ?? "(none)"}`);
    expect(wrong).toEqual([]);
  });

  it("uses one setup-cli action major everywhere", () => {
    const wrong = all
      .filter((i) => i.action !== ACTION_MAJOR)
      .map((i) => `${i.workflow}:${i.line} setup-cli@${i.action}`);
    expect(wrong).toEqual([]);
  });
});
