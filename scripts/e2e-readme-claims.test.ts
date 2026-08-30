// @vitest-environment node
//
// The e2e README said CI "currently runs only lint, typecheck, and the vitest
// suite, not Playwright" and that an e2e job pointed at a dedicated test
// Supabase "is needed" (#810). By then e2e.yml had gated every pull request for
// weeks. Nothing noticed, because nothing checked.
//
// Correcting the paragraph does not fix that: the next architecture change
// makes it stale again. These tests tie the doc's checkable claims to the
// workflow it describes, so drift fails here rather than misleading a reader
// (L32, L210, L244).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const README = readFileSync(join(process.cwd(), "e2e/README.md"), "utf8");

/** Every workflow path the README names, taken from the README itself. */
function workflowsNamed(): string[] {
  return [...README.matchAll(/`(\.github\/workflows\/[a-z0-9-]+\.yml)`/g)].map(
    (match) => match[1],
  );
}

describe("the e2e README's claims about CI", () => {
  it("names at least one workflow, or these tests assert about nothing", () => {
    expect(workflowsNamed().length).toBeGreaterThan(0);
  });

  it.each([...new Set(workflowsNamed())])("%s exists", (path) => {
    expect(existsSync(join(process.cwd(), path))).toBe(true);
  });

  // The job name is load bearing twice over: the ruleset requires it by name,
  // and the merged tree proof asks about that same name. A README quoting a
  // name nothing produces would send a reader looking for a check that is not
  // there.
  it("quotes a job name e2e.yml actually produces", () => {
    const quoted = README.match(/job name\s*\n?`([^`]+)`/);
    expect(quoted, "the README no longer quotes a job name").not.toBeNull();

    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/e2e.yml"),
      "utf8",
    );
    const jobName = workflow.match(/^\s{4}name: (.+)$/m)![1].trim();
    expect(quoted![1]).toBe(jobName);
  });

  it("is right that the Playwright suite runs on pull requests and on main", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/e2e.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
  });

  // The specific false claim this issue was about. Worth its own test: it is
  // the sentence that cost a reader the belief that Playwright gates nothing.
  it("no longer claims CI runs no Playwright job", () => {
    expect(README).not.toMatch(/not Playwright/i);
    expect(README).not.toMatch(/currently runs only/i);
  });

  // It said a dedicated test Supabase "is needed". The job needs no secrets and
  // starts a throwaway local one, so that claim would send somebody off to
  // provision a database and a set of secrets for nothing.
  it("does not send a reader to provision a test Supabase", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/e2e.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/supabase start/);
    expect(README).not.toMatch(/dedicated test Supabase \(with its secrets\) is\s*\n?needed/i);
  });
});
