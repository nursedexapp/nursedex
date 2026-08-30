// @vitest-environment node
//
// The production promotion gate (#817), carrying out the decision in #801:
// a merge to main must not reach a family until the checks on that commit are
// green.
//
// Vercel builds a STAGED production deployment on every push, serving nobody.
// This decides whether to promote it. Everything it cannot establish is a
// refusal, because refusing costs a deploy that waits for a person, and
// promoting wrongly puts untested code in front of families.
import { describe, it, expect } from "vitest";
import {
  decidePromotion,
  isFailure,
  missingSettings,
  runPromotion,
  type CheckRun,
  type Deployment,
} from "./promote-production";

const SHA = "abc123";

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    uid: "dpl_1",
    url: "nursedex-abc.vercel.app",
    readyState: "READY",
    readySubstate: "STAGED",
    target: "production",
    ...overrides,
  };
}

function greenChecks(): CheckRun[] {
  return [
    { name: "lint, typecheck, test", status: "completed", conclusion: "success" },
    { name: "authenticated e2e", status: "completed", conclusion: "success" },
  ];
}

const REQUIRED = ["lint, typecheck, test", "authenticated e2e"];

function decide(over: Partial<Parameters<typeof decidePromotion>[0]> = {}) {
  return decidePromotion({
    sha: SHA,
    deployments: [deployment()],
    checks: greenChecks(),
    requiredChecks: REQUIRED,
    ...over,
  });
}

describe("decidePromotion", () => {
  it("promotes a staged production build when every required check is green", () => {
    const d = decide();
    expect(d.action).toBe("promote");
    if (d.action !== "promote") return;
    expect(d.deployment.uid).toBe("dpl_1");
  });

  // Assume it runs twice. The workflow fires once per finishing check, so the
  // second arrival finds the work already done and must succeed, not fail.
  it("does nothing when that deployment has already been promoted", () => {
    const d = decide({ deployments: [deployment({ readySubstate: "PROMOTED" })] });
    expect(d.action).toBe("already-live");
  });

  it("waits rather than promoting while a required check is still running", () => {
    const d = decide({
      checks: [
        { name: "lint, typecheck, test", status: "in_progress", conclusion: null },
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    expect(d.action).toBe("wait");
    expect(d.reason).toMatch(/lint, typecheck, test/);
  });

  // The whole point of the gate.
  it("refuses when a required check failed", () => {
    const d = decide({
      checks: [
        { name: "lint, typecheck, test", status: "completed", conclusion: "failure" },
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/failure/);
  });

  // A check that is absent is not a check that passed. The ruleset requires
  // these by name, and a rename would make them silently missing (L305, L98).
  it("refuses when a required check is missing entirely", () => {
    const d = decide({
      checks: [
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/lint, typecheck, test/);
    expect(d.reason).toMatch(/no .*check|never ran|missing/i);
  });

  it("refuses a skipped check, which is not a passed one", () => {
    const d = decide({
      checks: [
        { name: "lint, typecheck, test", status: "completed", conclusion: "skipped" },
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    expect(d.action).toBe("refuse");
  });

  it("refuses when no production deployment exists for the commit", () => {
    const d = decide({ deployments: [] });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/no production deployment/i);
    expect(d.reason).toContain(SHA);
  });

  it("waits when the deployment for the commit is still building", () => {
    const d = decide({ deployments: [deployment({ readyState: "BUILDING" })] });
    expect(d.action).toBe("wait");
  });

  it("refuses when the build for the commit failed", () => {
    const d = decide({ deployments: [deployment({ readyState: "ERROR" })] });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/ERROR/);
  });

  // L521: a lookup needing exactly one match must treat many as its own
  // refusal, never silently take the first.
  it("refuses when more than one production deployment claims the commit", () => {
    const d = decide({
      deployments: [deployment({ uid: "dpl_1" }), deployment({ uid: "dpl_2" })],
    });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/more than one/i);
    expect(d.reason).toContain("dpl_1");
    expect(d.reason).toContain("dpl_2");
  });

  it("ignores a preview deployment for the same commit", () => {
    const d = decide({
      deployments: [deployment(), deployment({ uid: "dpl_preview", target: "preview" })],
    });
    expect(d.action).toBe("promote");
  });

  // Every outcome must be distinguishable. Two that read alike are one
  // outcome, and the indistinguishable one hides the broken case (L11, L260).
  it("gives every outcome its own reason", () => {
    const reasons = [
      decide({ deployments: [] }).reason,
      decide({ deployments: [deployment({ readyState: "BUILDING" })] }).reason,
      decide({ deployments: [deployment({ readySubstate: "PROMOTED" })] }).reason,
      decide({ checks: [] }).reason,
    ];
    expect(new Set(reasons).size).toBe(4);
    expect(reasons.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
  });
});

describe("runPromotion", () => {
  function harness(over: Partial<Parameters<typeof runPromotion>[0]> = {}) {
    const said: string[] = [];
    const promoted: string[] = [];
    return {
      said,
      promoted,
      deps: {
        sha: SHA,
        requiredChecks: REQUIRED,
        getChecks: async () => greenChecks(),
        getDeployments: async () => [deployment()],
        promote: async (uid: string) => {
          promoted.push(uid);
        },
        say: (line: string) => said.push(line),
        ...over,
      },
    };
  }

  it("promotes the deployment it decided on", async () => {
    const h = harness();
    await expect(runPromotion(h.deps)).resolves.toBe("promoted");
    expect(h.promoted).toEqual(["dpl_1"]);
    expect(h.said.join("\n")).toContain("done");
  });

  // The gate. Nothing may reach production while a check is red.
  it("does not promote when a check failed", async () => {
    const h = harness({
      getChecks: async () => [
        { name: "lint, typecheck, test", status: "completed", conclusion: "failure" },
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    await expect(runPromotion(h.deps)).resolves.toBe("refuse");
    expect(h.promoted).toEqual([]);
  });

  it("does not promote again when it is already live", async () => {
    const h = harness({
      getDeployments: async () => [deployment({ readySubstate: "PROMOTED" })],
    });
    await expect(runPromotion(h.deps)).resolves.toBe("already-live");
    expect(h.promoted).toEqual([]);
  });

  it("does not promote while a check is still running", async () => {
    const h = harness({
      getChecks: async () => [
        { name: "lint, typecheck, test", status: "in_progress", conclusion: null },
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
      ],
    });
    await expect(runPromotion(h.deps)).resolves.toBe("wait");
    expect(h.promoted).toEqual([]);
  });

  // A lookup that fell over must not read as "nothing to do". Production not
  // updating is the silent failure this whole workflow exists to avoid.
  it("reports a failed lookup as a failure, never as a quiet success", async () => {
    const h = harness({
      getDeployments: async () => {
        throw new Error("403 forbidden");
      },
    });
    await expect(runPromotion(h.deps)).resolves.toBe("failed");
    expect(h.promoted).toEqual([]);
    expect(h.said.join("\n")).toContain("403 forbidden");
    expect(h.said.join("\n")).toMatch(/still serving the previous build/);
  });

  it("reports a failed promotion the same way, rather than claiming success", async () => {
    const h = harness({
      promote: async () => {
        throw new Error("409 conflict");
      },
    });
    await expect(runPromotion(h.deps)).resolves.toBe("failed");
    expect(h.said.join("\n")).toMatch(/FAILED/);
    expect(h.said.join("\n")).toMatch(/still serving the previous build/);
  });

  it("never throws, so the reporting always happens", async () => {
    const h = harness({
      getChecks: async () => {
        throw new Error("boom");
      },
    });
    await expect(runPromotion(h.deps)).resolves.not.toThrow();
  });

  it("says something on every outcome", async () => {
    for (const over of [
      {},
      { getDeployments: async () => [deployment({ readySubstate: "PROMOTED" })] },
      { getChecks: async () => [] },
      {
        getDeployments: async () => {
          throw new Error("x");
        },
      },
    ]) {
      const h = harness(over as never);
      await runPromotion(h.deps);
      expect(h.said.length, JSON.stringify(Object.keys(over))).toBeGreaterThan(0);
    }
  });
});

describe("isFailure", () => {
  it("goes red on a refusal or a failure", () => {
    expect(isFailure("refuse")).toBe(true);
    expect(isFailure("failed")).toBe(true);
  });

  // The trigger fires once per finishing workflow, so the early run legitimately
  // has nothing to do. Failing on it would make this red on every single merge
  // and train everyone to ignore it (L36).
  it("stays green while waiting, and when it promoted or was already live", () => {
    expect(isFailure("wait")).toBe(false);
    expect(isFailure("promoted")).toBe(false);
    expect(isFailure("already-live")).toBe(false);
  });
});

describe("missingSettings", () => {
  const full = {
    GITHUB_REPOSITORY: "o/r",
    COMMIT_SHA: "abc",
    GITHUB_TOKEN: "gh",
    VERCEL_TOKEN: "vc",
  };

  it("is empty when everything is set", () => {
    expect(missingSettings(full)).toEqual([]);
  });

  // Named individually. "Not configured" alone sends the reader back to work
  // out which one, and the Vercel token is the one most likely to be absent.
  it("names each missing setting, not merely that one is missing", () => {
    expect(missingSettings({ ...full, VERCEL_TOKEN: undefined })).toEqual([
      "VERCEL_TOKEN",
    ]);
    expect(missingSettings({})).toEqual([
      "GITHUB_REPOSITORY",
      "COMMIT_SHA",
      "GITHUB_TOKEN",
      "VERCEL_TOKEN",
    ]);
  });

  // An empty string is how an unset GitHub secret actually arrives, and it must
  // not read as configured (L138).
  it("treats an empty value as missing, which is how an unset secret arrives", () => {
    expect(missingSettings({ ...full, VERCEL_TOKEN: "" })).toEqual(["VERCEL_TOKEN"]);
  });
});
