// @vitest-environment node
import { describe, it, expect } from "vitest";
import { compareToBaseline, type Counts } from "./db-error-ratchet";

const baseline: Counts = {
  "src/lib/admin/analytics.ts": { discarded: 16, disables: 0 },
  "src/lib/blog/queries.ts": { discarded: 16, disables: 0 },
};

describe("compareToBaseline", () => {
  it("passes when the tree matches the recorded counts exactly", () => {
    const verdict = compareToBaseline(baseline, baseline);
    expect(verdict.ok).toBe(true);
    expect(verdict.risen).toEqual([]);
  });

  it("fails when a file gains a discarded result", () => {
    const verdict = compareToBaseline(
      { ...baseline, "src/lib/blog/queries.ts": { discarded: 17, disables: 0 } },
      baseline,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.risen).toEqual([
      { file: "src/lib/blog/queries.ts", was: 16, now: 17 },
    ]);
  });

  it("fails when a file nobody has touched starts discarding", () => {
    const verdict = compareToBaseline(
      { ...baseline, "src/lib/new/thing.ts": { discarded: 1, disables: 0 } },
      baseline,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.risen).toEqual([
      { file: "src/lib/new/thing.ts", was: 0, now: 1 },
    ]);
  });

  it("fails on a fall too, so a stale baseline cannot hide a later rise", () => {
    // A ratchet left recording 16 where the tree now has 2 would let 14 new
    // instances back into that file unnoticed (L182). Progress is recorded in
    // the same commit that makes it.
    const verdict = compareToBaseline(
      { ...baseline, "src/lib/blog/queries.ts": { discarded: 2, disables: 0 } },
      baseline,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.fallen).toEqual([
      { file: "src/lib/blog/queries.ts", was: 16, now: 2 },
    ]);
  });

  it("counts a converted file leaving the tree as a fall, not a pass", () => {
    const { "src/lib/blog/queries.ts": _gone, ...rest } = baseline;
    const verdict = compareToBaseline(rest, baseline);
    expect(verdict.ok).toBe(false);
    expect(verdict.fallen).toEqual([
      { file: "src/lib/blog/queries.ts", was: 16, now: 0 },
    ]);
  });

  it("treats a new eslint-disable as a rise, so an exemption cannot be silent", () => {
    // #992: an exemption is a written decision, so it shows up as a diff line
    // rather than as one fewer warning.
    const verdict = compareToBaseline(
      {
        ...baseline,
        "src/lib/blog/queries.ts": { discarded: 15, disables: 1 },
      },
      baseline,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.exempted).toEqual([
      { file: "src/lib/blog/queries.ts", was: 0, now: 1 },
    ]);
  });

  it("reports every difference at once rather than the first", () => {
    const verdict = compareToBaseline(
      {
        "src/lib/admin/analytics.ts": { discarded: 17, disables: 0 },
        "src/lib/blog/queries.ts": { discarded: 17, disables: 0 },
      },
      baseline,
    );
    expect(verdict.risen).toHaveLength(2);
  });
});
