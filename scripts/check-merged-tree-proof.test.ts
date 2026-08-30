// @vitest-environment node
//
// The step the workflow actually runs (#812, #817).
//
// It must never fail the job. Its answer decides whether the suite runs, and
// the safe answer is always "run it", so every failure mode here has to arrive
// as a refusal rather than as a crash or a red step. But a refusal it produced
// because it could not READ anything is a different event from a refusal it
// reasoned its way to, and the two must not read alike: the first means the
// saving has silently stopped happening while everything stays green (L289).
import { describe, it, expect } from "vitest";
import { runProofCheck } from "./check-merged-tree-proof";

const PUSHED = "cccccccccccccccccccccccccccccccccccccccc";
const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TREE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function deps(gather: () => Promise<unknown>) {
  const outputs: string[] = [];
  const summary: string[] = [];
  const logs: string[] = [];
  return {
    calls: { outputs, summary, logs },
    options: {
      gather: gather as never,
      repo: "nursedexapp/nursedex",
      sha: PUSHED,
      requiredCheck: "authenticated e2e",
      writeOutput: (line: string) => outputs.push(line),
      writeSummary: (line: string) => summary.push(line),
      log: (line: string) => logs.push(line),
    },
  };
}

const provenFacts = {
  pushedSha: PUSHED,
  pushedTree: TREE,
  requiredCheck: "authenticated e2e",
  pulls: [
    {
      number: 794,
      merged: true,
      baseRef: "main",
      headSha: HEAD,
      headTree: TREE,
      checks: [
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    },
  ],
};

describe("runProofCheck", () => {
  it("reports the proof held, naming the pull request it rests on", async () => {
    const { calls, options } = deps(async () => provenFacts);
    await runProofCheck(options);

    expect(calls.outputs.join("\n")).toContain("proven=true");
    const text = calls.summary.join("\n");
    expect(text).toContain("#794");
    expect(text).toContain(TREE);
  });

  it("reports a refusal with the reason, and never claims the proof held", async () => {
    const { calls, options } = deps(async () => ({ ...provenFacts, pulls: [] }));
    await runProofCheck(options);

    expect(calls.outputs.join("\n")).toContain("proven=false");
    expect(calls.outputs.join("\n")).not.toContain("proven=true");
    expect(calls.summary.join("\n")).toMatch(/no pull request/i);
  });

  // A lookup that fell over and a commit that genuinely has no pull request
  // both mean "run the suite", but only one of them means something is broken.
  // Reported identically, a permanently failing token reads as a quiet month of
  // direct pushes and the saving disappears with every check still green.
  it("marks a failed lookup as a failure, distinctly from a reasoned refusal", async () => {
    const { calls, options } = deps(async () => {
      throw new Error("403 rate limit exceeded");
    });
    await runProofCheck(options);

    const text = calls.summary.join("\n");
    expect(calls.outputs.join("\n")).toContain("proven=false");
    expect(text).toMatch(/could not be evaluated|lookup failed/i);
    expect(text).toContain("403 rate limit exceeded");
    // The wording a reasoned refusal uses must not appear here.
    expect(text).not.toMatch(/no pull request is associated/i);
  });

  // Visible in the run list, not only to somebody who opens the summary. One
  // blip and a permanently broken token otherwise look identical (L77).
  it("raises a workflow warning when the lookup fails", async () => {
    const { calls, options } = deps(async () => {
      throw new Error("403 rate limit exceeded");
    });
    await runProofCheck(options);
    expect(calls.logs.some((line) => line.startsWith("::warning"))).toBe(true);
  });

  it("raises no warning when the proof simply does not hold", async () => {
    const { calls, options } = deps(async () => ({ ...provenFacts, pulls: [] }));
    await runProofCheck(options);
    expect(calls.logs.some((line) => line.startsWith("::warning"))).toBe(false);
  });

  it("never rejects, whatever happens, because a crash would fail the job", async () => {
    const { options } = deps(async () => {
      throw new Error("boom");
    });
    await expect(runProofCheck(options)).resolves.not.toThrow();
  });

  it("writes an output even when the lookup fails, so the caller is never left guessing", async () => {
    const { calls, options } = deps(async () => {
      throw new Error("boom");
    });
    await runProofCheck(options);
    expect(calls.outputs.some((line) => line.startsWith("proven="))).toBe(true);
  });

  it("returns the decision to its caller as well as writing it", async () => {
    const { options } = deps(async () => provenFacts);
    await expect(runProofCheck(options)).resolves.toBe(true);
  });
});
