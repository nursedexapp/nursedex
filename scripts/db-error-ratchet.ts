/**
 * Hold the number of discarded database errors where it is, for the length of
 * milestone 35, and fail when it rises.
 *
 * `local/require-db-error-check` ships at `warn` rather than `error` because
 * 283 sites already break it (measured 4 September 2026). A warning nothing
 * counts is a warning nobody reads, and a rule that lands at the END of a
 * sweep leaves the whole sweep as the window in which somebody writes number
 * 284. So the count is recorded per file, and CI fails on any difference.
 *
 * ANY difference, in both directions. A ratchet left recording 16 where the
 * tree now holds 2 quietly re-admits 14 instances to that file, and the number
 * stops being a measurement of anything (L182). Each conversion phase records
 * its own progress in the same commit, so the baseline diff IS the record of
 * what the sweep did.
 *
 * Disables are counted separately and a new one also fails, because #992 wants
 * an exemption to be a written decision with a reason, not one fewer warning.
 *
 *   npx tsx scripts/db-error-ratchet.ts            check
 *   npx tsx scripts/db-error-ratchet.ts --update   re-record after a conversion
 */
import { ESLint } from "eslint";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const RULE = "local/require-db-error-check";
const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const BASELINE = join(REPO_ROOT, "scripts/db-error-baseline.json");

export interface FileCount {
  /** Sites still discarding the result. */
  discarded: number;
  /** Sites exempted by an inline eslint-disable, which must carry a reason. */
  disables: number;
}

export type Counts = Record<string, FileCount>;

export interface Move {
  file: string;
  was: number;
  now: number;
}

export interface Verdict {
  ok: boolean;
  risen: Move[];
  fallen: Move[];
  exempted: Move[];
}

const ZERO: FileCount = { discarded: 0, disables: 0 };

/**
 * Compare the tree against what was recorded. Every difference is reported,
 * not the first: a run that names one file sends somebody back for another
 * run, and the point of the ratchet is to say where the sweep now stands.
 */
export function compareToBaseline(actual: Counts, baseline: Counts): Verdict {
  const files = [
    ...new Set([...Object.keys(actual), ...Object.keys(baseline)]),
  ].sort();
  const risen: Move[] = [];
  const fallen: Move[] = [];
  const exempted: Move[] = [];

  for (const file of files) {
    const now = actual[file] ?? ZERO;
    const was = baseline[file] ?? ZERO;
    if (now.discarded > was.discarded) {
      risen.push({ file, was: was.discarded, now: now.discarded });
    } else if (now.discarded < was.discarded) {
      fallen.push({ file, was: was.discarded, now: now.discarded });
    }
    if (now.disables !== was.disables) {
      exempted.push({ file, was: was.disables, now: now.disables });
    }
  }

  return {
    ok: risen.length === 0 && fallen.length === 0 && exempted.length === 0,
    risen,
    fallen,
    exempted,
  };
}

/** Count the inline disables of this rule, which ESLint does not report. */
export function countDisables(source: string): number {
  const pattern = new RegExp(
    `eslint-disable(?:-next-line|-line)?[^\\n]*${RULE.replace("/", "\\/")}`,
    "g",
  );
  return (source.match(pattern) ?? []).length;
}

/** Run the real project config over the tree and count this rule's reports. */
export async function measure(): Promise<Counts> {
  // The real config, not a hand-built one: a ratchet measuring a config nobody
  // ships would hold a number that means nothing (#584 is the same lesson).
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: join(REPO_ROOT, "eslint.config.mjs"),
    // Deliberately uncached. The lint step's cache stores results per file, and
    // a cache keyed on a config this script does not change would be correct,
    // but the whole value of this check is that its number is the tree's, so it
    // reads the tree.
    cache: false,
  });
  const results = await eslint.lintFiles([REPO_ROOT]);

  const counts: Counts = {};
  for (const result of results) {
    const file = relative(REPO_ROOT, result.filePath);
    const discarded = result.messages.filter((m) => m.ruleId === RULE).length;
    const disables = countDisables(readFileSync(result.filePath, "utf8"));
    if (discarded === 0 && disables === 0) continue;
    counts[file] = { discarded, disables };
  }
  return counts;
}

function readBaseline(): Counts {
  return JSON.parse(readFileSync(BASELINE, "utf8")).files as Counts;
}

function describe(moves: Move[], heading: string): string {
  if (moves.length === 0) return "";
  const lines = moves.map((m) => `    ${m.file}: ${m.was} -> ${m.now}`);
  return `\n  ${heading}\n${lines.join("\n")}`;
}

async function main(): Promise<void> {
  const actual = await measure();
  const total = Object.values(actual).reduce((n, c) => n + c.discarded, 0);
  const exemptions = Object.values(actual).reduce((n, c) => n + c.disables, 0);

  if (process.argv.includes("--update")) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          rule: RULE,
          measuredOn: new Date().toISOString().slice(0, 10),
          total,
          exemptions,
          files: Object.fromEntries(
            Object.entries(actual).sort(([a], [b]) => a.localeCompare(b)),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `Recorded ${total} discarded database results across ` +
        `${Object.keys(actual).length} files, and ${exemptions} written exemptions.`,
    );
    return;
  }

  const verdict = compareToBaseline(actual, readBaseline());
  if (verdict.ok) {
    console.log(
      `Discarded database results: ${total}, matching the recorded baseline ` +
        `(${exemptions} written exemptions). Milestone 35 drives this to zero.`,
    );
    return;
  }

  console.error(
    "The discarded-database-error count does not match scripts/db-error-baseline.json." +
      describe(
        verdict.risen,
        "Gained (a database result whose error is dropped, #847):",
      ) +
      describe(
        verdict.fallen,
        "Removed (good, but record it: run `npx tsx scripts/db-error-ratchet.ts --update` and commit the baseline):",
      ) +
      describe(
        verdict.exempted,
        "Exemptions changed (an eslint-disable must carry a written reason saying what the value means where it is consumed, #992):",
      ) +
      "\n",
  );
  process.exitCode = 1;
}

// Only when run as a script, so the unit test can import the pure functions.
if (process.argv[1] && process.argv[1].endsWith("db-error-ratchet.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
