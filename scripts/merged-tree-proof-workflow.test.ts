// @vitest-environment node
//
// Wiring for the merged tree proof (#812), which since #801 is what the
// production promotion gate rests on (#817).
//
// The proof decides whether a suite runs on a push to main. Everything here is
// about the two ways that can go wrong: a step that should have been skipped
// running anyway (harmless, just slow), and a step that should have RUN being
// skipped, which ships untested code. Only the second matters, so the tests
// below are mostly about what must never be skipped.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GUARD = "steps.proof.outputs.proven != 'true'";

function read(path: string): string {
  return readFileSync(join(process.cwd(), `.github/workflows/${path}`), "utf8");
}

/**
 * Split a workflow's steps into ordered blocks. Derived from the file rather
 * than listed here: a hand-written list of steps checks only the steps somebody
 * remembered to add, and a newly added one is exempt from the very rule this
 * exists to enforce (L96).
 */
function steps(yaml: string): Array<{ name: string; body: string }> {
  const parts = yaml.split(/\n(?=      - name: )/);
  return parts
    .map((part) => {
      const match = part.match(/^\s*- name: (.+)$/m);
      return match ? { name: match[1].trim(), body: part } : null;
    })
    .filter((step): step is { name: string; body: string } => step !== null);
}

/** The `name:` of the workflow's single job, which is its check name. */
function jobName(yaml: string): string {
  const match = yaml.match(/^\s{4}name: (.+)$/m);
  if (!match) throw new Error("workflow has no job name");
  return match[1].trim().replace(/^"|"$/g, "");
}

describe.each(["ci.yml", "e2e.yml"])("%s asks the proof correctly", (file) => {
  const yaml = read(file);

  // A pull request has nothing to prove: its own run is what creates the green
  // check a later push would rest on. Running the proof there could only ever
  // find the PR's own commit, and a proof that held would skip the very run
  // main's ruleset requires (L142: the observed half is not the dangerous one).
  it("asks only on a push, never on a pull request", () => {
    const proof = steps(yaml).find((s) => s.name === "Check the merged tree proof");
    expect(proof).toBeDefined();
    expect(proof!.body).toContain("if: github.event_name == 'push'");
  });

  // L305: a ruleset requires checks BY NAME, and the ruleset is the one place a
  // search of the repo cannot find. If this job is renamed, the proof would go
  // on asking about a check name nothing produces, quietly never hold, and the
  // saving would vanish with everything still green.
  it("rests on the check this job itself produces", () => {
    const proof = steps(yaml).find((s) => s.name === "Check the merged tree proof");
    const required = proof!.body.match(/REQUIRED_CHECK: (.+)/)![1].trim();
    expect(required.replace(/^"|"$/g, "")).toBe(jobName(yaml));
  });

  it("reads its token from the workflow secret rather than a literal", () => {
    const proof = steps(yaml).find((s) => s.name === "Check the merged tree proof");
    expect(proof!.body).toMatch(/GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  });
});

describe("e2e.yml skips only what the proof covers", () => {
  const yaml = read("e2e.yml");
  const all = steps(yaml);
  const proofIndex = all.findIndex((s) => s.name === "Check the merged tree proof");

  it("has the proof before anything expensive", () => {
    expect(proofIndex).toBeGreaterThan(-1);
    // Checkout, node setup and the tsx install are all that precede it.
    expect(proofIndex).toBeLessThanOrEqual(3);
  });

  // Positional, not a list of names: every step after the proof is covered by
  // construction, including one added tomorrow by somebody who never read this.
  it("guards every step that comes after the proof", () => {
    const unguarded = all
      .slice(proofIndex + 1)
      .filter((step) => !step.body.includes(GUARD))
      .map((step) => step.name);
    expect(unguarded).toEqual([]);
  });

  // The report upload runs on failure too, so its condition is compound. It
  // still has to carry the guard, or a proven run would try to upload a
  // directory nothing wrote.
  it("keeps the report upload conditional on failure AND on the proof", () => {
    const upload = all.find((s) => s.name.includes("Upload Playwright report"));
    expect(upload!.body).toContain("!cancelled()");
    expect(upload!.body).toContain(GUARD);
  });
});

describe("ci.yml keeps running what the proof does not cover", () => {
  const yaml = read("ci.yml");
  const all = steps(yaml);
  const named = (name: string) => all.find((s) => s.name === name)!;

  it("skips lint, typecheck and the vitest suite when the tree is proven", () => {
    for (const name of ["Lint", "Typecheck", "Run tests"]) {
      expect(named(name).body, `${name} is not guarded`).toContain(GUARD);
    }
  });

  // The full sweep is the one thing on a push that did NOT run on the pull
  // request: a branch run only re-proves the guards it could have broken. It is
  // new work on this commit, so no proof about the tree covers it.
  it("always runs the full guard mutation sweep on a push", () => {
    const sweep = named("Prove guard tests can fail (full sweep)");
    expect(sweep.body).not.toContain(GUARD);
    expect(sweep.body).toContain("github.event_name == 'push'");
  });

  // The sweep spawns vitest against the real tree, so the install cannot be
  // skipped even when everything else can.
  it("always installs dependencies, because the sweep needs them", () => {
    expect(named("Install dependencies").body).not.toContain(GUARD);
  });
});

describe.each(["ci.yml", "e2e.yml"])("%s cannot be broken by the proof", (file) => {
  const all = steps(read(file));

  // The proof is an optimisation. An optimisation that can fail the job is
  // worse than no optimisation, and since #801 a failed job on main blocks the
  // production promotion, so a hiccup installing tsx would stop a deploy that
  // has nothing wrong with it.
  //
  // With these, a failure leaves `proven` empty, which reads as not proven and
  // runs everything. The step summary still reports a failed lookup, so the
  // saving cannot quietly stop happening unnoticed (L289).
  it.each(["Install tsx", "Check the merged tree proof"])(
    "lets %s fail without failing the job",
    (name) => {
      const step = all.find((s) => s.name === name);
      expect(step, `${name} not found in ${file}`).toBeDefined();
      expect(step!.body).toContain("continue-on-error: true");
    },
  );
});
