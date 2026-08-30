// Dividing the guard mutation sweep across lanes (#807).
//
// The sweep spawns one vitest per mutant: 105 boots for about 24 seconds of
// test bodies, 211 seconds on the CI runner. The lever is the boot, and since
// #801 that time sits on the production deploy path (#817), so it is worth
// paying attention to.
//
// A mutation is a write to a real source file, so lanes cannot share a working
// tree and each gets its own copy. What is divided here is the list of mutants.

/**
 * Divide jobs across `laneCount` lanes, balanced by measured cost.
 *
 * Longest-processing-time-first: sort by cost descending, and put each job in
 * the lane that is currently cheapest. The sweep costs whatever its SLOWEST
 * lane costs, so an even count of mutants is the wrong target: suites differ by
 * several times in duration, and a lane holding the long ones finishes last
 * however few it holds (L296).
 *
 * Deterministic for a given input, so two runs of the same sweep divide the
 * same way and a difference between them means something.
 */
export function partitionByCost<T>(
  jobs: readonly T[],
  cost: (job: T) => number,
  laneCount: number,
): T[][] {
  if (!Number.isInteger(laneCount) || laneCount < 1) {
    throw new Error(
      `A sweep needs at least one lane, got ${laneCount}. Zero lanes would ` +
        `run no mutants while reporting a completed partition.`,
    );
  }

  const lanes: T[][] = Array.from({ length: laneCount }, () => []);
  const totals = new Array<number>(laneCount).fill(0);

  const weighed = jobs.map((job, index) => {
    const weight = cost(job);
    if (!Number.isFinite(weight) || weight <= 0) {
      // A zero, negative or NaN weight makes every lane look equally loaded,
      // so the partition would read as balanced while being arbitrary (L50).
      throw new Error(
        `Job ${index} has a cost of ${weight}, which is not a positive ` +
          `finite duration. The measurement failed; refusing to divide by it.`,
      );
    }
    return { job, weight, index };
  });

  // Ties broken by original index, so the result does not depend on sort
  // stability across engines.
  weighed.sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { job, weight } of weighed) {
    let cheapest = 0;
    for (let i = 1; i < laneCount; i++) {
      if (totals[i] < totals[cheapest]) cheapest = i;
    }
    lanes[cheapest].push(job);
    totals[cheapest] += weight;
  }

  return lanes;
}

/* --------------------------------------------------------------- workspaces */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Directories that must not be copied into a lane: enormous, rebuilt, or
 * meaningless outside the original checkout.
 */
const NOT_COPIED = [
  ".git",
  "node_modules",
  ".next",
  "coverage",
  "playwright-report",
  "test-results",
];

/**
 * A lane's own copy of the working tree.
 *
 * The WORKING tree, not HEAD: the sweep mutates the files as they are on disk,
 * so a lane built from the last commit would silently test different code
 * whenever anything is uncommitted, and report a clean sweep about it.
 */
export function createLaneWorkspace(repoRoot: string, parent: string): string {
  const lane = mkdtempSync(join(parent, "lane-"));

  execFileSync(
    "rsync",
    ["-a", ...NOT_COPIED.flatMap((dir) => ["--exclude", dir]), `${repoRoot}/`, `${lane}/`],
    { stdio: "pipe" },
  );

  // node_modules is 1.1GB, so it is shared rather than copied. Entry by entry,
  // not one symlink at the top, because vitest WRITES into node_modules/.vite
  // (its transform and results caches) and four lanes writing to one shared
  // cache is a race in the middle of the script that proves the guards work.
  // Those two get real directories per lane; everything else is a link.
  const source = join(repoRoot, "node_modules");
  const target = join(lane, "node_modules");
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (entry === ".vite" || entry === ".cache") {
      mkdirSync(join(target, entry), { recursive: true });
      continue;
    }
    symlinkSync(join(source, entry), join(target, entry));
  }

  return lane;
}

export function createLaneWorkspaces(
  repoRoot: string,
  count: number,
): { lanes: string[]; cleanup: () => void } {
  const parent = mkdtempSync(join(tmpdir(), "guard-mutation-lanes-"));
  const lanes: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      lanes.push(createLaneWorkspace(repoRoot, parent));
    }
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
  return {
    lanes,
    // Removed whatever happens: a lane left behind holds a copy of the source
    // with a guard possibly still neutralised in it.
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  };
}

/** How many lanes to use, given the machine and an optional override. */
export function laneCountFor(cpus: number, override?: string): number {
  if (override !== undefined && override !== "") {
    const wanted = Number(override);
    if (!Number.isInteger(wanted) || wanted < 1) {
      throw new Error(
        `GUARD_MUTATION_LANES must be a whole number of lanes, got "${override}".`,
      );
    }
    return wanted;
  }
  // One lane per core, floored at 1 and capped at 4: past that the lanes
  // contend for the same cores and each vitest boot gets slower, so the sweep
  // stops getting faster while the copies keep costing disk.
  return Math.max(1, Math.min(4, cpus));
}

/** Whether rsync is available to build lane workspaces. */
export function hasRsync(): boolean {
  try {
    execFileSync("rsync", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
