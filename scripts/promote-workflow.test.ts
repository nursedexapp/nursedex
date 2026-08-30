// @vitest-environment node
//
// Wiring for the production promotion gate (#817).
//
// This workflow is what makes #801's decision real: a merge does not reach a
// family until the checks on that commit are green. It is also the one place
// where a silent failure means production quietly stops updating, which looks
// exactly like a quiet week, so its shape is worth pinning.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/promote.yml"),
  "utf8",
);
const RUNNER = readFileSync(
  join(process.cwd(), "scripts/check-promote-production.ts"),
  "utf8",
);

/** Where the outcomes and their wording live, once the shell was thinned. */
const DECIDER = readFileSync(
  join(process.cwd(), "scripts/promote-production.ts"),
  "utf8",
);

/** Where the URLs live. Its behaviour is driven in promote-transport.test.ts. */
const TRANSPORT = readFileSync(
  join(process.cwd(), "scripts/promote-transport.ts"),
  "utf8",
);

/**
 * The transport with comments stripped. Several of them quote the very strings
 * being checked for, and a check over the raw file cannot tell the line doing a
 * thing from the line explaining it: the filter=latest assertion below passed
 * against a version that had dropped it from the URL and kept it in the comment
 * (L103, L135).
 */
const TRANSPORT_CODE = TRANSPORT.split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
  .join("\n");

describe("the promote workflow", () => {
  it("runs after both gating workflows finish, on main only", () => {
    expect(WORKFLOW).toMatch(/workflows:\s*\[CI, E2E\]/);
    expect(WORKFLOW).toMatch(/types:\s*\[completed\]/);
    expect(WORKFLOW).toMatch(/branches:\s*\[main\]/);
  });

  // The commit the finished run was ABOUT, not the tip of main. Those differ
  // the moment a second merge lands while this one is still being checked, and
  // promoting the tip would put live a commit nothing in this run looked at
  // (L237: addressing by position rather than identity).
  it("promotes the commit the finished run was about, not the current tip", () => {
    expect(WORKFLOW).toMatch(
      /COMMIT_SHA:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/,
    );
    expect(WORKFLOW).not.toMatch(/COMMIT_SHA:\s*\$\{\{\s*github\.sha/);
  });

  // A cancelled promotion leaves a merge built but not live, which is the
  // silent failure this exists to avoid (L98).
  it("never cancels a promotion in progress", () => {
    expect(WORKFLOW).toMatch(/cancel-in-progress:\s*false/);
  });

  it("carries a timeout, like every other job here", () => {
    expect(WORKFLOW).toMatch(/timeout-minutes:\s*\d+/);
  });

  it("asks GitHub for read access only; the write is Vercel's own token", () => {
    const block = WORKFLOW.match(/^permissions:\n(?:\s+.*\n)+/m)![0];
    expect(block).toMatch(/checks:\s*read/);
    expect(block).not.toMatch(/:\s*write/);
    expect(WORKFLOW).toMatch(/VERCEL_TOKEN:\s*\$\{\{\s*secrets\.VERCEL_TOKEN\s*\}\}/);
  });
});

describe("the promotion runner", () => {
  // The exact names the `Protect main` ruleset requires. A rename there makes
  // them silently absent here, and absent is refused rather than passed (L305).
  it("requires both gating checks by their exact names", () => {
    expect(RUNNER).toContain('"lint, typecheck, test"');
    expect(RUNNER).toContain('"authenticated e2e"');
  });

  // Verified against Vercel's own OpenAPI spec rather than memory: the read is
  // GET /v7/deployments filtered by sha, the write is POST to the v10 promote
  // path with teamId as a query parameter.
  it("uses the endpoints Vercel documents", () => {
    expect(TRANSPORT_CODE).toMatch(/api\.vercel\.com\/v7\/deployments\?/);
    expect(TRANSPORT_CODE).toMatch(/&sha=\$\{sha\}/);
    expect(TRANSPORT_CODE).toMatch(
      /api\.vercel\.com\/v10\/projects\/\$\{VERCEL_PROJECT_ID\}\/promote\/\$\{uid\}/,
    );
    expect(TRANSPORT_CODE).toMatch(/teamId=\$\{VERCEL_TEAM_ID\}/);
  });

  // A superseded run reports under the same check name and would otherwise
  // answer for the one that replaced it, in either direction (L179).
  it("reads only the latest run of each check", () => {
    expect(TRANSPORT_CODE).toMatch(/filter=latest/);
  });

  // A promotion that silently did not happen leaves production serving the
  // previous build. Every failure path has to be loud (L13, #837).
  it("fails loudly rather than passing when it cannot promote", () => {
    expect(RUNNER).toMatch(/process\.exit\(1\)/);
    expect(DECIDER).toMatch(/still serving the previous build/);
  });

  // Four outcomes, four wordings. Two that read alike are one outcome in
  // practice, and the indistinguishable one is always the broken case (L11).
  it("distinguishes waiting from refusing from already live", () => {
    for (const outcome of ["waiting", "REFUSED", "already live", "FAILED"]) {
      expect(DECIDER, `no wording for ${outcome}`).toContain(outcome);
    }
  });
});
