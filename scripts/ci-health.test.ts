// @vitest-environment node
//
// Counting how often two "tolerable" outcomes actually happen (#818).
//
// A Playwright flake and a merged tree proof that could not be evaluated are
// both classified as fine: the run goes green either way. But the code waving
// them through has no notion of volume, so one blip and a permanently broken
// lookup arrive on the same path and are indistinguishable, which leaves the
// second invisible for exactly as long as it lasts (L77).
//
// Both now announce themselves on EVERY run, so absence of a signal means the
// run could not report rather than that it was healthy.
import { describe, it, expect } from "vitest";
import {
  collectOutcomes,
  findAnnotation,
  flakedInRun,
  proofWasUnavailable,
  formatRate,
  rateOf,
  shouldFail,
  type NamedRate,
  type RateResult,
  type RunOutcome,
} from "./ci-health";

function runs(...outcomes: Array<string | null>): RunOutcome[] {
  return outcomes.map((value, index) => ({ runId: 100 + index, value }));
}

describe("rateOf", () => {
  it("counts only runs that reported, and says how many that was", () => {
    // Two flaked, three were clean, and two could not report at all.
    const result = rateOf(runs("1", "0", "0", "2", "0", null, null), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.5,
    });
    expect(result.reporting).toBe(5);
    expect(result.silent).toBe(2);
    expect(result.bad).toBe(2);
    expect(result.rate).toBeCloseTo(0.4, 5);
  });

  // The whole reason both signals were changed to announce every run. Counting
  // a silent run as healthy reads every run from before the instrument existed
  // as a clean one, and reports a rate far below the real one (L223).
  it("never counts a silent run as a healthy one", () => {
    const withSilent = rateOf(runs("1", null, null, null), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.5,
    });
    expect(withSilent.rate).toBe(1);
    expect(withSilent.reporting).toBe(1);
  });

  // A rate computed from almost nothing is noise, and a proportion cannot tell
  // one bad out of two from twelve out of twelve (L139). Refusing is the
  // honest answer, and it must not read as healthy.
  it("refuses to judge a sample too small to mean anything", () => {
    const result = rateOf(runs("1", null, null), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.5,
      minimumRuns: 5,
    });
    expect(result.verdict).toBe("insufficient");
    expect(result.message).toMatch(/only 1 .* reported|not enough/i);
  });

  it("reports nothing at all as insufficient, not as clean", () => {
    const result = rateOf(runs(null, null), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.5,
      minimumRuns: 1,
    });
    expect(result.verdict).toBe("insufficient");
    expect(result.verdict).not.toBe("ok");
  });

  it("is over budget above the threshold and fine below it", () => {
    const opts = { isBad: (v: string) => Number(v) > 0, threshold: 0.3, minimumRuns: 1 };
    expect(rateOf(runs("1", "1", "0", "0"), opts).verdict).toBe("over");
    expect(rateOf(runs("1", "0", "0", "0", "0"), opts).verdict).toBe("ok");
  });

  // The boundary belongs to the passing side, so a threshold set from a
  // measured value does not fire on the measurement that set it.
  it("treats exactly the threshold as within budget", () => {
    const result = rateOf(runs("1", "0", "0", "0"), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.25,
      minimumRuns: 1,
    });
    expect(result.verdict).toBe("ok");
  });

  it("names the runs that were bad, so they can be opened without a search", () => {
    const result = rateOf(runs("0", "3", "0"), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.9,
      minimumRuns: 1,
    });
    expect(result.badRunIds).toEqual([101]);
  });

  it("always says how many were silent, since that is the measurement's own health", () => {
    const result = rateOf(runs("0", null), {
      isBad: (v) => Number(v) > 0,
      threshold: 0.9,
      minimumRuns: 1,
    });
    expect(result.message).toMatch(/1 .*(silent|did not report)/i);
  });
});

describe("findAnnotation", () => {
  /** An API answering the two documented endpoints, recording what it was asked. */
  function fakeApi(jobs: number[], annotations: Record<number, Array<{ title: string | null; message: string }>>) {
    const asked: string[] = [];
    const api = async (path: string) => {
      asked.push(path);
      if (path.includes("/jobs")) return { jobs: jobs.map((id) => ({ id })) };
      const id = Number(path.match(/check-runs\/(\d+)/)![1]);
      return annotations[id] ?? [];
    };
    return { api, asked };
  }

  it("finds the annotation by title, whichever job carries it", async () => {
    const { api } = fakeApi([1, 2], {
      1: [{ title: "Something else", message: "no" }],
      2: [{ title: "Playwright flake count", message: "FLAKY_COUNT=2 EXECUTED=69" }],
    });
    await expect(
      findAnnotation(api, "o/r", 500, "Playwright flake count"),
    ).resolves.toBe("FLAKY_COUNT=2 EXECUTED=69");
  });

  // Null means "this run did not report", which the counter treats as
  // unmeasured. It must never be confused with a healthy run (L223).
  it("returns null when no job carries that title", async () => {
    const { api } = fakeApi([1], { 1: [{ title: "Other", message: "x" }] });
    await expect(findAnnotation(api, "o/r", 500, "Playwright flake count")).resolves.toBeNull();
  });

  it("returns null for a run with no jobs at all, rather than throwing", async () => {
    const { api } = fakeApi([], {});
    await expect(findAnnotation(api, "o/r", 500, "T")).resolves.toBeNull();
  });

  // A failed lookup must not arrive as an absence: it would be counted as a
  // silent run and quietly lower the measured population (L215).
  it("lets an API failure through rather than reporting an absence", async () => {
    const api = async () => {
      throw new Error("403 rate limit exceeded");
    };
    await expect(findAnnotation(api, "o/r", 500, "T")).rejects.toThrow(/rate limit/);
  });

  it("does not match an annotation with no title", async () => {
    const { api } = fakeApi([1], { 1: [{ title: null, message: "FLAKY_COUNT=9" }] });
    await expect(findAnnotation(api, "o/r", 500, "Playwright flake count")).resolves.toBeNull();
  });
});

describe("collectOutcomes", () => {
  it("asks for completed runs only, and for the limit it was given", async () => {
    const asked: string[] = [];
    const api = async (path: string) => {
      asked.push(path);
      if (path.includes("/runs?")) return { workflow_runs: [{ id: 7 }] };
      if (path.includes("/jobs")) return { jobs: [] };
      return [];
    };
    const out = await collectOutcomes(api, "o/r", "e2e.yml", "T", 20);
    expect(asked[0]).toContain("status=completed");
    expect(asked[0]).toContain("per_page=20");
    expect(out).toEqual([{ runId: 7, value: null }]);
  });

  it("returns one entry per run, keeping runs that reported nothing", async () => {
    const api = async (path: string) => {
      if (path.includes("/runs?")) return { workflow_runs: [{ id: 1 }, { id: 2 }] };
      if (path.includes("/jobs")) return { jobs: [{ id: 10 }] };
      // Only run 1's job carries it; job ids are shared here on purpose.
      return path.includes("check-runs/10")
        ? [{ title: "T", message: "FLAKY_COUNT=0" }]
        : [];
    };
    const out = await collectOutcomes(api, "o/r", "e2e.yml", "T", 5);
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.runId > 0)).toBe(true);
  });
});

describe("flakedInRun", () => {
  it("reads the count out of the message", () => {
    expect(flakedInRun("FLAKY_COUNT=0 EXECUTED=69")).toBe(false);
    expect(flakedInRun("FLAKY_COUNT=1 EXECUTED=69")).toBe(true);
    expect(flakedInRun("FLAKY_COUNT=12 EXECUTED=69")).toBe(true);
  });

  // A message it cannot parse is NOT a clean run. If it were, a change to the
  // reporter's wording would silently zero the rate, which is the exact
  // failure this whole issue exists to prevent (L50).
  it("counts a message it cannot parse as bad, never as clean", () => {
    for (const message of ["", "no count here", "FLAKY_COUNT=", "FLAKY_COUNT=abc"]) {
      expect(flakedInRun(message), JSON.stringify(message)).toBe(true);
    }
  });
});

describe("proofWasUnavailable", () => {
  // Refusing is the proof WORKING: a direct push or a changed tree is a
  // reasoned refusal, not a fault. Only "could not evaluate" counts.
  it("treats held and refused as fine", () => {
    expect(proofWasUnavailable("OUTCOME=held PULL=820")).toBe(false);
    expect(proofWasUnavailable("OUTCOME=refused")).toBe(false);
  });

  it("treats unavailable as the fault it is", () => {
    expect(proofWasUnavailable("OUTCOME=unavailable")).toBe(true);
  });

  it("treats an unrecognised message as a fault, not as fine", () => {
    for (const message of ["", "OUTCOME=", "something else", "OUTCOME=heldish"]) {
      expect(proofWasUnavailable(message), JSON.stringify(message)).toBe(true);
    }
  });
});

describe("shouldFail", () => {
  const rate = (verdict: "ok" | "over" | "insufficient"): NamedRate => ({
    name: "x",
    result: {
      verdict,
      reporting: 10,
      silent: 0,
      bad: 1,
      rate: 0.1,
      badRunIds: [],
      message: "",
    },
  });

  it("fails when any signal is over budget", () => {
    expect(shouldFail([rate("ok"), rate("over")])).toBe(true);
  });

  it("passes when every signal is within budget", () => {
    expect(shouldFail([rate("ok"), rate("ok")])).toBe(false);
  });

  // "Not judged" must not fail. It is an honest refusal when there is too
  // little data, and failing on it would make this red every time the repo
  // goes quiet for a week, which is how a check trains everyone to ignore it
  // (L36). This one watches for something already invisible.
  it("does not fail on a signal it refused to judge", () => {
    expect(shouldFail([rate("insufficient"), rate("insufficient")])).toBe(false);
  });

  it("passes on no signals at all rather than throwing", () => {
    expect(shouldFail([])).toBe(false);
  });
});

describe("formatRate", () => {
  function named(overrides: Partial<RateResult> = {}): NamedRate {
    return {
      name: "Playwright flakes",
      result: {
        verdict: "over",
        reporting: 10,
        silent: 2,
        bad: 5,
        rate: 0.5,
        badRunIds: [111, 222],
        message: "5 of 10 reporting runs (50%) were bad.",
        ...overrides,
      },
    };
  }

  it("says which signal and how it fared", () => {
    const out = formatRate(named(), "o/r");
    expect(out).toContain("Playwright flakes");
    expect(out).toContain("OVER BUDGET");
    expect(out).toContain("5 of 10");
  });

  // A message naming runs the reader has to go and find by hand is a dead end:
  // the surface showing the problem must carry the way to act on it (L80).
  it("links the runs that were bad, so they can be opened directly", () => {
    const out = formatRate(named(), "o/r");
    expect(out).toContain("https://github.com/o/r/actions/runs/111");
    expect(out).toContain("https://github.com/o/r/actions/runs/222");
  });

  it("omits the run list when there is nothing to link", () => {
    const out = formatRate(named({ verdict: "ok", badRunIds: [] }), "o/r");
    expect(out).not.toContain("Runs:");
    expect(out).toContain("within budget");
  });

  // Three verdicts, three words. Two that read alike would be one verdict in
  // practice, and "not judged" reading as "fine" is the whole hazard (L11).
  it("gives each verdict its own wording", () => {
    const words = (["ok", "over", "insufficient"] as const).map(
      (verdict) => formatRate(named({ verdict }), "o/r").split("\n")[0],
    );
    expect(new Set(words).size).toBe(3);
    expect(words[2]).not.toMatch(/within budget/);
  });
});
