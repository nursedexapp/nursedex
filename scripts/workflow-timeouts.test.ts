// @vitest-environment node
//
// Every job in every workflow must declare a timeout (#809).
//
// Three of the five declared none, so each inherited GitHub's six hour default:
// a Supabase CLI download that hangs, or a link that never answers, would hold
// a runner and bill 360 minutes. A hang is worse than a failure, because it is
// indistinguishable from slowness and nothing ever reports it (L110).
//
// This asks the DIRECTORY, not a list of files. The four existing workflow
// tests each pin one file's shape, so a sixth workflow would be exempt from
// every one of them; a guard driven by a hand-written registry checks only what
// the registry lists (L96, L313).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

type Job = { workflow: string; id: string; body: string };

/**
 * Every job in every workflow file, found structurally rather than by name.
 *
 * Deliberately no YAML library: the only one installed here is a transitive
 * dependency of something else, so nothing pins it and nothing would notice it
 * going away (L25).
 */
function allJobs(): Job[] {
  const jobs: Job[] = [];

  for (const workflow of readdirSync(DIR).filter((f) => f.endsWith(".yml"))) {
    const lines = readFileSync(join(DIR, workflow), "utf8").split("\n");
    const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
    if (start === -1) continue;

    let current: Job | null = null;
    for (const line of lines.slice(start + 1)) {
      const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (header) {
        if (current) jobs.push(current);
        current = { workflow, id: header[1], body: "" };
        continue;
      }
      // A line at column zero ends the jobs block.
      if (/^\S/.test(line)) break;
      if (current) current.body += `${line}\n`;
    }
    if (current) jobs.push(current);
  }

  return jobs;
}

const JOBS = allJobs();

describe("every workflow job", () => {
  // A guard whose subject list can silently become empty passes hardest when it
  // is measuring nothing at all (L98). This has to fail if the parser breaks.
  it("is found by the parser, across every workflow in the directory", () => {
    expect(JOBS.length).toBeGreaterThanOrEqual(5);
    const workflows = new Set(JOBS.map((job) => job.workflow));
    const files = readdirSync(DIR).filter((f) => f.endsWith(".yml"));
    expect(workflows.size).toBe(files.length);
  });

  it.each(JOBS.map((job) => [`${job.workflow}:${job.id}`, job] as const))(
    "%s declares a timeout",
    (_label, job) => {
      expect(job.body).toMatch(/^\s+timeout-minutes:\s*\d+\s*$/m);
    },
  );

  it.each(JOBS.map((job) => [`${job.workflow}:${job.id}`, job] as const))(
    "%s declares a timeout that is a positive number of minutes",
    (_label, job) => {
      const minutes = Number(job.body.match(/timeout-minutes:\s*(\d+)/)![1]);
      expect(minutes).toBeGreaterThan(0);
      // A ceiling as well as a floor. The point of the timeout is to bound a
      // hang, and a number large enough to be indistinguishable from the six
      // hour default bounds nothing while reading as deliberate. The longest
      // job here is the e2e suite at about 13 minutes.
      expect(minutes).toBeLessThanOrEqual(30);
    },
  );
});
