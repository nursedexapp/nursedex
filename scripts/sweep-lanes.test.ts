// @vitest-environment node
//
// Dividing the guard mutation sweep across lanes (#807).
//
// A mutation is a write to a real source file, so lanes cannot share a working
// tree: each gets its own copy. What is divided is the list of mutants, and it
// is divided by MEASURED cost, never by count. Suites differ by several times
// in how long they take, so an even count of mutants is an uneven division of
// time, and the slowest lane is what the sweep actually costs (L296).
import { describe, it, expect } from "vitest";
import {
  createLaneWorkspace,
  createLaneWorkspaces,
  hasRsync,
  laneCountFor,
  partitionByCost,
} from "./sweep-lanes";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type Job = { id: string; ms: number };
const cost = (job: Job) => job.ms;

function jobs(...ms: number[]): Job[] {
  return ms.map((value, index) => ({ id: `j${index}`, ms: value }));
}

/** The wall clock a partition implies: the slowest lane, not the average. */
function slowestLane(lanes: Job[][]): number {
  return Math.max(...lanes.map((lane) => lane.reduce((n, j) => n + j.ms, 0)));
}

describe("partitionByCost", () => {
  it("puts every job in exactly one lane", () => {
    const all = jobs(5, 1, 3, 9, 2, 7);
    const lanes = partitionByCost(all, cost, 3);
    const placed = lanes.flat().map((job) => job.id).sort();
    expect(placed).toEqual(all.map((job) => job.id).sort());
    expect(placed).toHaveLength(all.length);
  });

  // The whole point. Dividing by count here gives lanes of 10+1 and 1+1+1+1+1+1,
  // so the sweep costs 11. Dividing by cost gives 10 and 6.
  it("balances by time, not by how many jobs each lane gets", () => {
    const lanes = partitionByCost(jobs(10, 1, 1, 1, 1, 1, 1), cost, 2);
    expect(slowestLane(lanes)).toBeLessThanOrEqual(10);
    // And it really is unbalanced by count, which a count-based split would not be.
    const sizes = lanes.map((lane) => lane.length).sort();
    expect(sizes).not.toEqual([3, 4]);
  });

  it("never beats the single slowest job, which is the floor", () => {
    const lanes = partitionByCost(jobs(10, 2, 2, 2), cost, 4);
    expect(slowestLane(lanes)).toBeGreaterThanOrEqual(10);
  });

  it("leaves lanes empty rather than splitting a job, when there are more lanes than jobs", () => {
    const lanes = partitionByCost(jobs(3, 1), cost, 5);
    expect(lanes).toHaveLength(5);
    expect(lanes.flat()).toHaveLength(2);
  });

  it("is deterministic, so two runs of the same sweep divide the same way", () => {
    const all = jobs(4, 4, 4, 1, 9, 2);
    expect(partitionByCost(all, cost, 3)).toEqual(partitionByCost(all, cost, 3));
  });

  it("puts everything in one lane when asked for one", () => {
    const lanes = partitionByCost(jobs(1, 2, 3), cost, 1);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toHaveLength(3);
  });

  it("refuses a lane count below one rather than returning nothing to run", () => {
    expect(() => partitionByCost(jobs(1), cost, 0)).toThrow(/lane/i);
  });

  // A cost function that returns zero, a negative, or NaN makes the whole
  // division meaningless, and the result would look like a balanced partition
  // (L50, L98). Refuse rather than divide by a measurement that failed.
  it("refuses a cost that cannot be real", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => partitionByCost(jobs(1), () => bad, 2), String(bad)).toThrow(
        /cost/i,
      );
    }
  });

  it("returns empty lanes for no jobs at all, without throwing", () => {
    expect(partitionByCost([], cost, 3)).toEqual([[], [], []]);
  });
});

describe("laneCountFor", () => {
  it("uses one lane per core", () => {
    expect(laneCountFor(2)).toBe(2);
    expect(laneCountFor(4)).toBe(4);
  });

  // Past four the lanes contend for the same cores: each vitest boot gets
  // slower, so the sweep stops getting faster while the copies keep costing
  // disk.
  //
  // The CI runner reports TWO cores, measured from os.cpus().length on a real
  // run: the sweep chose two lanes and logged it. So this cap is inert there.
  // An earlier version of this comment said four, taken from the issue text
  // rather than from the machine, which is exactly the kind of number that
  // reads as measured when it never was (L316).
  it("caps at four however many cores there are", () => {
    expect(laneCountFor(16)).toBe(4);
  });

  it("never returns zero lanes, whatever the machine reports", () => {
    expect(laneCountFor(0)).toBe(1);
    expect(laneCountFor(-1)).toBe(1);
  });

  it("honours an explicit override, including one lane for a sequential run", () => {
    expect(laneCountFor(8, "1")).toBe(1);
    expect(laneCountFor(2, "6")).toBe(6);
  });

  // An override that cannot be read must refuse, not fall back to the default:
  // a typo would otherwise silently run the sweep in a shape nobody chose.
  it("refuses an override it cannot read", () => {
    for (const bad of ["two", "0", "-1", "2.5"]) {
      expect(() => laneCountFor(4, bad), bad).toThrow(/lanes/i);
    }
  });

  it("ignores an empty override, which is how an unset variable arrives", () => {
    expect(laneCountFor(3, "")).toBe(3);
  });
});

describe("createLaneWorkspace", () => {
  // The sweep mutates the files as they are ON DISK. A lane built from the last
  // commit would silently test different code whenever anything is uncommitted,
  // and then report a clean sweep about code nobody is running. Nothing would
  // go red, which is what makes it worth a test of its own.
  it("copies the working tree, including changes that are not committed", () => {
    if (!hasRsync()) return; // The single-lane path is taken instead.
    const source = mkdtempSync(join(tmpdir(), "sweep-lane-source-"));
    const parent = mkdtempSync(join(tmpdir(), "sweep-lane-parent-"));
    try {
      mkdirSync(join(source, "src"), { recursive: true });
      mkdirSync(join(source, "node_modules", "left-pad"), { recursive: true });
      writeFileSync(join(source, "src", "guard.ts"), "uncommitted edit");
      writeFileSync(join(source, "node_modules", "left-pad", "index.js"), "x");

      const lane = createLaneWorkspace(source, parent);
      expect(readFileSync(join(lane, "src", "guard.ts"), "utf8")).toBe(
        "uncommitted edit",
      );

      // A mutation in the lane must not reach the original, or the lanes are
      // writing over each other and over the developer's own files.
      writeFileSync(join(lane, "src", "guard.ts"), "mutated");
      expect(readFileSync(join(source, "src", "guard.ts"), "utf8")).toBe(
        "uncommitted edit",
      );
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  // node_modules is 1.1GB and shared by link, but vitest WRITES its transform
  // and results caches into node_modules/.vite. Four lanes writing to one
  // shared cache is a race inside the script that proves the guards work.
  it("shares node_modules by link but gives each lane its own vitest cache", () => {
    if (!hasRsync()) return;
    const source = mkdtempSync(join(tmpdir(), "sweep-lane-source-"));
    const parent = mkdtempSync(join(tmpdir(), "sweep-lane-parent-"));
    try {
      mkdirSync(join(source, "node_modules", "left-pad"), { recursive: true });
      mkdirSync(join(source, "node_modules", ".vite"), { recursive: true });
      writeFileSync(join(source, "node_modules", ".vite", "shared"), "original");

      const lane = createLaneWorkspace(source, parent);
      expect(lstatSync(join(lane, "node_modules", "left-pad")).isSymbolicLink()).toBe(
        true,
      );
      const cache = join(lane, "node_modules", ".vite");
      expect(lstatSync(cache).isSymbolicLink()).toBe(false);
      expect(lstatSync(cache).isDirectory()).toBe(true);
      expect(existsSync(join(cache, "shared"))).toBe(false);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("removes every lane on cleanup, so no copy is left holding a neutralised guard", () => {
    if (!hasRsync()) return;
    const source = mkdtempSync(join(tmpdir(), "sweep-lane-source-"));
    try {
      mkdirSync(join(source, "src"), { recursive: true });
      mkdirSync(join(source, "node_modules"), { recursive: true });
      writeFileSync(join(source, "src", "guard.ts"), "x");

      const { lanes, cleanup } = createLaneWorkspaces(source, 2);
      expect(lanes).toHaveLength(2);
      expect(lanes.every((lane) => existsSync(lane))).toBe(true);
      cleanup();
      expect(lanes.some((lane) => existsSync(lane))).toBe(false);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });
});
