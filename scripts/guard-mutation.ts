// Mutation testing for the authorization boundary (#642).
//
// src/lib/admin/authz-boundary.test.ts, src/app/page-authz-boundary.test.tsx and
// src/app/api/route-guard-coverage.test.ts prove every guarded surface HAS a
// test. None of them can prove the test would FAIL if the guard were deleted,
// which is the only property that matters. Every gap closed in #617, #629, #618,
// #633 and #634 had a passing test that could not fail: four cron tests stubbed
// the guard and asserted the stub's own 401, five asserted "no email sent"
// against an empty result set, three page tests passed because the page
// redirected for an unrelated reason. All were found by hand, by deleting each
// guard and watching whether the suite noticed.
//
// This does that automatically, for every guard call site: neutralize the guard,
// run the suite that is supposed to catch it, and report any suite that stays
// green. A green suite with the guard gone is a test that cannot fail.
//
// WHY NEUTRALIZE RATHER THAN DELETE THE LINE
//
// Deleting `const admin = await requireAdmin()` leaves the module referencing a
// binding that no longer exists. The suite goes red on the breakage, the mutant
// is scored "killed", and the guard is certified as tested when the test
// detected nothing. That false green is precisely the failure this job exists to
// catch, one level up. So each guard is rewritten to its own "caller admitted"
// outcome instead: the module still compiles and runs, and the only thing gone
// is the refusal. classifyRun() then refuses to score a mutant killed unless a
// test actually ran and actually failed.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import {
  createLaneWorkspaces,
  hasRsync,
  laneCountFor,
  partitionByCost,
} from "./sweep-lanes";
import { checkSweepHeadroom, readJobTimeoutMinutes } from "./sweep-headroom";
import { tmpdir } from "node:os";

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..");

/**
 * The share of ci.yml's job timeout the sweep may use before it is called a
 * problem (#807).
 *
 * Half, not a rounder number, because of where the real value sits: the
 * sequential sweep used about 23% (211s of 900s) and the lanes bring that well
 * under 10%. A threshold inside the dense middle turns the check into noise, so
 * this sits far above today's value and still leaves the sweep unable to reach
 * the timeout without being reported first (L172).
 */
const SWEEP_DEADLINE_FRACTION = 0.5;

/** How each guard says "this caller may proceed". */
type Admits =
  | { kind: "user"; role: string | "from-args" }
  | { kind: "null" }
  | { kind: "true" };

const GUARDS: Record<string, Admits> = {
  // Page and server action guards. They return the caller and redirect to refuse,
  // so an admitted caller is simply a user object.
  requireAuth: { kind: "user", role: "family" },
  requireRole: { kind: "user", role: "from-args" },
  requireAdmin: { kind: "user", role: "super_admin" },
  requireSuperAdmin: { kind: "user", role: "super_admin" },
  getCurrentUser: { kind: "user", role: "family" },
  // Returns a 401 response, or null when the caller is allowed through.
  verifyCronAuth: { kind: "null" },
  // Booleans: true is the admitted value, and each is read inside an `if (!...)`.
  verifyBearerSecret: { kind: "true" },
  verifySecretHeader: { kind: "true" },
  verifySlackRequest: { kind: "true" },
  verifySignature: { kind: "true" },
};

/**
 * The name given to a hand-written role refusal, which is a guard without being
 * a call to anything (#683).
 *
 * getCurrentUser answers WHO is calling. The next line answers WHETHER they may,
 * and in a member-facing action nobody wrote a helper for it:
 *
 *   if (user.role !== "family") return { success: false, error: "wrong_role" };
 *
 * The collector only knew how to find calls, so this was invisible: deleting it
 * from revealNurse would let a NURSE reveal another nurse's contact details, and
 * the sweep would still report a clean board.
 */
export const ROLE_CHECK = "role-check";

/**
 * A role refusal: a NEGATIVE comparison against a role, which is what turns a
 * caller away. `role === "family"` is deliberately not matched: it picks a
 * branch rather than refusing anyone, which is what the dashboard layout does to
 * choose a sidebar.
 */
// The comparison is matched against the MASKED source, where a string's contents
// are blanked to spaces and only its quotes survive, so the role name itself
// cannot be part of the pattern.
const ROLE_REFUSAL = /\b([\w$]+)(?:\?\.|\.)role\s*!==\s*["'][^"'\n]*["']/g;

/**
 * Identifiers bound to the CALLER, i.e. to getCurrentUser() or a require* guard.
 *
 * A role comparison only guards the boundary when it is about the caller.
 * `target.role !== "admin"` in demoteAdmin asks whether the person being demoted
 * is an admin, and claimHireByEmail asks whether the email it looked up belongs
 * to a family. Both are state checks on a row, neither refuses the caller, and
 * mutating them would report a survivor for a line that never guarded anything.
 */
function callerNames(masked: string): Set<string> {
  const names = new Set<string>();
  const re =
    /\b(?:const|let|var)\s+([\w$]+)\s*=\s*await\s+(?:getCurrentUser|require[A-Za-z]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) names.add(m[1]);
  return names;
}

/**
 * Files this job does not mutate, and why. Anything skipped here is a guard
 * whose test is NOT proven able to fail, so each entry has to earn its place.
 */
export const EXCLUDED: Record<string, string> = {
  "src/app/api/stripe/webhook/route.ts":
    "Stripe refuses a bad signature by THROWING out of constructEvent, not by returning a no. Neutralizing it means fabricating a whole valid payment event for the handler to process, which would test the fabrication rather than the guard. Stated plainly: the Stripe webhook's guard test is not proven able to fail (#642).",
  "src/lib/auth/helpers.ts":
    "Defines requireAuth, requireRole, requireAdmin and requireSuperAdmin. A definition is not a call site, and neutralizing it would disable every guard at once.",
  "src/lib/cron/auth.ts": "Defines verifyCronAuth. Not a call site.",
  "src/lib/security/shared-secret.ts":
    "Defines verifyBearerSecret and verifySecretHeader. Not a call site.",
  "src/lib/slack/client.ts": "Defines verifySlackRequest. Not a call site.",
};

export interface GuardSite {
  file: string;
  /** 1-indexed, for the report. */
  line: number;
  /** Character offset of the guard name in the source. */
  index: number;
  guard: string;
}

/**
 * Blank out comments and string literals, preserving every character offset, so
 * a guard named in a comment or a string is not mistaken for a call. This is the
 * same false positive #644 describes in the route coverage check, where a
 * commented-out guard still reads as protection.
 */
export function maskNonCode(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < n) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const quote = src[i];
      let k = i + 1;
      while (k < n && src[k] !== quote) {
        if (src[k] === "\\") k++;
        k++;
      }
      // Leave the quotes themselves so requireRole's argument can still be read.
      blank(i + 1, k);
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

export function collectGuardSites(file: string, source: string): GuardSite[] {
  const masked = maskNonCode(source);
  const sites: GuardSite[] = [];
  const isRoute = /^src\/app\/api\/.+\/route\.ts$/.test(
    file.split(sep).join("/"),
  );
  // A server action is a publicly callable endpoint, not an internal helper, and
  // the "use server" directive is what makes it one. Read it from the source
  // rather than the path: a file is an endpoint because of the directive, and a
  // path convention is only a guess at it.
  const isServerAction = /^\s*["']use server["']/m.test(source);

  for (const guard of Object.keys(GUARDS)) {
    // getCurrentUser refuses nobody IN A PAGE. There it is a read used to
    // personalize what renders: the dashboard layout uses it to pick a sidebar
    // and happily tolerates a null user, and the pages themselves are guarded by
    // require* instead. Mutating it there reports a survivor for a line that was
    // never protecting anything.
    //
    // In an API route and in a SERVER ACTION it is the authentication itself: the
    // route returns a 401 and the action returns not_authenticated when it comes
    // back null. Skipping it in server actions (#681) meant nothing ever proved
    // those guards could fail, across five action files, on endpoints anyone can
    // POST to. The old skip applied a page's reasoning to an endpoint.
    if (guard === "getCurrentUser" && !isRoute && !isServerAction) continue;

    const re = new RegExp(`\\b${guard}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const index = m.index;
      const lineStart = masked.lastIndexOf("\n", index) + 1;
      // `import { requireAdmin } from ...` names the guard without calling it,
      // and a `function requireAdmin(` line is a definition, not a call.
      const lineText = masked.slice(lineStart, masked.indexOf("\n", index));
      if (
        /^\s*(import|export\s+(async\s+)?function|function)\b/.test(lineText)
      ) {
        continue;
      }
      sites.push({
        file,
        index,
        guard,
        line: source.slice(0, index).split("\n").length,
      });
    }
  }

  // Hand-written role refusals. Only in an endpoint: a page or layout compares a
  // role to choose what to render, and refusing there is done with requireRole.
  if (isServerAction || isRoute) {
    const callers = callerNames(masked);
    ROLE_REFUSAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROLE_REFUSAL.exec(masked)) !== null) {
      if (!callers.has(m[1])) continue;
      sites.push({
        file,
        index: m.index,
        guard: ROLE_CHECK,
        line: source.slice(0, m.index).split("\n").length,
      });
    }
  }

  return sites.sort((a, b) => a.index - b.index);
}

/** Find the end of `name(...)`, counting nested parentheses in the arguments. */
function endOfCall(src: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`Unbalanced call at offset ${openParen}`);
}

function admittedUser(role: string): string {
  return `Promise.resolve({ id: "00000000-0000-4000-8000-000000000000", email: "mutant@example.com", role: "${role}", is_suspended: false, is_deleted: false } as never)`;
}

/** Rewrite one guard call into its "caller admitted" outcome. */
export function mutate(source: string, site: GuardSite): string {
  // A role refusal is neutralized to `false`, so the refusal never fires and
  // every role is admitted. Only the ROLE comparison is replaced: a leading
  // `!user ||` survives untouched, or the mutant would delete the authentication
  // too and the suite could go red for a reason that is not the role.
  if (site.guard === ROLE_CHECK) {
    ROLE_REFUSAL.lastIndex = site.index;
    const m = ROLE_REFUSAL.exec(source);
    if (!m || m.index !== site.index) {
      throw new Error(`Role check at ${site.file}:${site.line} moved`);
    }
    return (
      source.slice(0, site.index) +
      "false" +
      source.slice(site.index + m[0].length)
    );
  }

  const admits = GUARDS[site.guard];
  const open = source.indexOf("(", site.index);
  const end = endOfCall(source, open);
  const args = source.slice(open + 1, end - 1);

  let replacement: string;
  if (admits.kind === "null") {
    replacement = "null";
  } else if (admits.kind === "true") {
    replacement = "true";
  } else {
    // requireRole("nurse") must hand back a NURSE. The page that demanded the
    // role goes on to use the caller as one, and a super_admin would break it
    // for a reason that has nothing to do with the boundary.
    const role =
      admits.role === "from-args"
        ? (args.match(/["']([a-z_]+)["']/)?.[1] ?? "family")
        : admits.role;
    replacement = admittedUser(role);
  }

  return source.slice(0, site.index) + replacement + source.slice(end);
}

/**
 * The suite that is supposed to catch a guard going missing.
 *
 * Keyed on the GUARD as well as the file, because one action file can hold both
 * kinds. reviews/actions.ts authenticates a family with getCurrentUser and also
 * calls requireRole elsewhere; blog/actions.ts is all requireAdmin. Routing by
 * file alone sent a whole file to one suite, and when #681 added the
 * getCurrentUser sites it dragged 21 require* guards away from the admin suite
 * that had been proving them for months. The guard is what decides who is
 * responsible.
 */
export function suiteFor(file: string, guard?: string): string | null {
  const f = file.split(sep).join("/");

  if (f === "src/lib/email/route-handler.ts") {
    return "src/lib/email/route-handler.test.ts";
  }
  if (/^src\/app\/api\/.+\/route\.ts$/.test(f)) {
    return f.replace(/route\.ts$/, "route.test.ts");
  }
  if (/^src\/app\/.+\/(page|layout)\.tsx$/.test(f)) {
    return "src/app/page-authz-boundary.test.tsx";
  }
  if (/^src\/lib\/.+[a-z-]*actions\.ts$/.test(f)) {
    // A member-facing action authenticates with getCurrentUser and refuses a
    // wrong role with a hand-written check. Nothing proved either could fail
    // until #681 and #683. Admin actions keep their own boundary suite.
    const isAdminAction = /^src\/lib\/admin\//.test(f);
    if (
      !isAdminAction &&
      (guard === "getCurrentUser" || guard === ROLE_CHECK)
    ) {
      return "src/lib/action-authz-boundary.test.ts";
    }
    // Everything else in an action file is a require* guard, and the admin
    // boundary suite has run the real ones against a mocked session since #493.
    return "src/lib/admin/authz-boundary.test.ts";
  }
  return null;
}

/**
 * The guards a pull request has to re-prove.
 *
 * A full sweep is 83 mutants and a minute and a half, which is more than every
 * pull request should pay when most touch no guard at all. But scoping to "guard
 * files this branch edited" alone leaves the more likely hole open: WEAKENING A
 * TEST DOES NOT TOUCH THE GUARD. Someone who stubs requireAdmin inside the
 * boundary suite changes one test file and no guard file, which is exactly how
 * the four cron tests in #617 came to assert their own stub's 401. So a change
 * to a suite re-proves every guard that suite is responsible for, and a change
 * to this runner re-proves everything.
 */
export function affectedSites(
  sites: GuardSite[],
  changed: string[],
): GuardSite[] {
  const set = new Set(changed.map((f) => f.split(sep).join("/")));
  if (set.has("scripts/guard-mutation.ts")) return sites;
  return sites.filter(
    (s) => set.has(s.file) || set.has(suiteFor(s.file, s.guard) ?? "\0"),
  );
}

/** One test in the suite, and HOW it failed if it did. */
export interface TestOutcome {
  name: string;
  failed: boolean;
  /** It failed on an assertion, rather than crashing before reaching one. */
  byAssertion: boolean;
}

export interface RunResult {
  exitCode: number;
  numTotalTests: number;
  numFailedTests: number;
  /** Why each failing test failed, from vitest's json report. */
  failureMessages?: string[];
  /** Per test, so a hollow one cannot hide behind a working sibling (#648). */
  tests?: TestOutcome[];
}

export type Verdict = "killed" | "weak" | "survived" | "error";

/**
 * A mutant is only KILLED if a test actually ran, actually failed, and failed on
 * an ASSERTION.
 *
 * Two traps, both of which score a test as protective when it is not:
 *
 * 1. The exit code alone. A mutation that breaks the module makes vitest fail to
 *    collect the file: non-zero exit, zero tests run, indistinguishable from a
 *    test catching the missing guard.
 *
 * 2. A crash. With the guard neutralized, /api/slack/track's GET runs on to
 *    `request.nextUrl` and throws a TypeError, because the test hands it a fake
 *    request carrying only headers. The suite goes red, so CI is protected, but
 *    it went red on the crash rather than on the 401 assertion, and it goes red
 *    just the same when the assertion is DELETED. Scored a plain kill, that test
 *    could be hollowed out to `expect(res).toBeDefined()` and still be certified
 *    as guarding the route. That is the exact false green this job exists to
 *    catch, so it gets its own verdict rather than being waved through.
 */
/**
 * Failing tests that never reached an assertion, when a sibling did (#648).
 *
 * The gate credits a kill to the whole FILE. So with the guard gone,
 * /api/slack/track's POST test can fail on its 401 assertion while the GET test
 * fails on a TypeError, because the fake request it is handed carries no
 * nextUrl. The mutant is scored KILLED on the strength of POST, and the GET test
 * is quietly certified as guarding the route while proving nothing: it is red
 * for a reason that is not its assertion, so it would be red with its assertion
 * DELETED, and it could be hollowed out to `expect(res).toBeDefined()` and
 * nobody would notice.
 *
 * That is the same sampling mistake the boundary suites kept making, one level
 * up: judging a group and assuming every member of it.
 *
 * A run where EVERY failure is a crash is not listed here. That is the existing
 * `weak` verdict, and reporting one mutant twice under two names is noise.
 */
export function hollowRiskTests(r: RunResult): string[] {
  const tests = r.tests ?? [];
  const failed = tests.filter((t) => t.failed);
  if (failed.length === 0) return [];
  // Only interesting when a sibling DID assert: that is the hiding place.
  if (!failed.some((t) => t.byAssertion)) return [];
  return failed.filter((t) => !t.byAssertion).map((t) => t.name);
}

export function classifyRun(r: RunResult): Verdict {
  if (r.numTotalTests === 0) return "error";
  if (r.exitCode === 0) return "survived";
  if (r.numFailedTests === 0) return "error";

  const messages = r.failureMessages ?? [];
  // No messages to judge by: treat as a kill rather than invent a failure.
  if (messages.length === 0) return "killed";

  const byAssertion = messages.some((m) => /AssertionError/i.test(m));
  return byAssertion ? "killed" : "weak";
}

/**
 * Every suite must be green BEFORE anything is mutated. If a suite is already
 * red, every mutant "fails" and every guard gets certified: a clean sweep that
 * means nothing. Fail loudly instead.
 */
export async function assertBaselineGreen(
  suites: string[],
  run: (suite: string) => Promise<RunResult>,
): Promise<void> {
  for (const suite of suites) {
    const r = await run(suite);
    if (r.numTotalTests === 0) {
      throw new Error(
        `Baseline: ${suite} ran no tests. Nothing would be verified by mutating against it.`,
      );
    }
    if (r.exitCode !== 0 || r.numFailedTests > 0) {
      throw new Error(
        `Baseline: ${suite} is already failing before any mutation. Fix it first, or every mutant looks killed and every guard looks tested.`,
      );
    }
  }
}

/**
 * Run `fn` with the file rewritten, and put the original back no matter what.
 *
 * This edits real source files in the working tree. A crash that left a guard
 * neutralized on disk could be committed, which would be this job disabling a
 * guard it exists to protect.
 */
export async function withMutation<T>(
  file: string,
  mutated: string,
  fn: () => Promise<T>,
): Promise<T> {
  const original = readFileSync(file, "utf8");
  writeFileSync(file, mutated);
  try {
    return await fn();
  } finally {
    writeFileSync(file, original);
  }
}

/* ------------------------------------------------------------------ runner */

function runVitest(suite: string, root: string = REPO_ROOT): Promise<RunResult> {
  const dir = mkdtempSync(join(tmpdir(), "guard-mutation-"));
  const outFile = join(dir, "result.json");

  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "vitest",
        "run",
        suite,
        "--reporter=json",
        `--outputFile=${outFile}`,
        "--silent",
      ],
      { cwd: root, stdio: "ignore" },
    );

    child.on("close", (code) => {
      let numTotalTests = 0;
      let numFailedTests = 0;
      let failureMessages: string[] = [];
      let tests: TestOutcome[] = [];
      try {
        const json = JSON.parse(readFileSync(outFile, "utf8"));
        numTotalTests = json.numTotalTests ?? 0;
        numFailedTests = json.numFailedTests ?? 0;
        type Assertion = {
          fullName?: string;
          title?: string;
          status?: string;
          failureMessages?: string[];
        };
        const assertions: Assertion[] = (json.testResults ?? []).flatMap(
          (file: { assertionResults?: Assertion[] }) =>
            file.assertionResults ?? [],
        );
        failureMessages = assertions.flatMap((a) => a.failureMessages ?? []);
        // Per test, not per file: which test failed, and whether its own
        // assertion is what failed (#648).
        tests = assertions.map((a) => {
          const messages = a.failureMessages ?? [];
          return {
            name: a.fullName ?? a.title ?? "(unnamed)",
            failed: a.status === "failed",
            byAssertion: messages.some((m) => /AssertionError/i.test(m)),
          };
        });
      } catch {
        // No parseable report means vitest could not even collect the suite.
        // Left at zero, which classifyRun reads as an error, never as a kill.
      }
      rmSync(dir, { recursive: true, force: true });
      resolve({
        exitCode: code ?? 1,
        numTotalTests,
        numFailedTests,
        failureMessages,
        tests,
      });
    });
  });
}

/** Every file that calls a guard: server actions, pages and layouts, API routes. */
function guardedFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (entry.name.includes(".test.")) continue;
      if (!/\.tsx?$/.test(entry.name)) continue;

      const rel = relative(REPO_ROOT, full).split(sep).join("/");
      if (EXCLUDED[rel]) continue;

      const src = readFileSync(full, "utf8");
      if (collectGuardSites(rel, src).length > 0) found.push(rel);
    }
  };

  walk(join(REPO_ROOT, "src", "lib"));
  walk(join(REPO_ROOT, "src", "app"));
  return found;
}

interface Finding {
  site: GuardSite;
  suite: string;
  verdict: Verdict;
  /** Tests that went red on a crash while a sibling asserted (#648). */
  hollow: string[];
}

async function main() {
  const arg = process.argv[2] ?? "";
  const since = arg.startsWith("--since=")
    ? arg.slice("--since=".length)
    : null;
  const only = since ? null : arg || null;

  let sites: GuardSite[] = [];
  const unmapped: GuardSite[] = [];

  for (const file of guardedFiles()) {
    const src = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const site of collectGuardSites(file, src)) {
      if (suiteFor(file, site.guard)) sites.push(site);
      else unmapped.push(site);
    }
  }

  if (sites.length === 0) {
    // A scan that found nothing would otherwise report a flawless sweep.
    throw new Error(
      "Found no guard call sites at all. The scan is broken, and a broken scan reports a clean sweep.",
    );
  }

  // Checked before any scoping: a guard no suite claims can never be re-proven,
  // so it must fail the run even on a branch that changed nothing else. A guard
  // nobody verifies is a guard nobody is protecting.
  if (unmapped.length > 0) {
    process.exitCode = 1;
    console.error("Guards that no suite claims:");
    for (const s of unmapped) {
      console.error(`  ${s.file}:${s.line} ${s.guard}`);
    }
  }

  if (since) {
    const changed = execSync(`git diff --name-only ${since}...HEAD`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    sites = affectedSites(sites, changed);
    if (sites.length === 0) {
      console.log(
        `No guard and no boundary suite changed since ${since}. Nothing to re-prove.`,
      );
      return;
    }
  } else if (only) {
    sites = sites.filter((s) => s.file.includes(only));
  }

  console.log(`Guard call sites to mutate: ${sites.length}`);

  const suites = [...new Set(sites.map((s) => suiteFor(s.file, s.guard)!))];
  console.log(`Checking ${suites.length} suites are green first...`);

  // Time the baseline runs. They run every suite once anyway, so this is the
  // cost of each suite measured in THIS run on THIS machine, which is what the
  // lanes are then divided by. A fixed table of weights would be a measurement
  // of whatever machine wrote it (L224, L296).
  const suiteMs = new Map<string, number>();
  await assertBaselineGreen(suites, async (suite) => {
    const started = Date.now();
    const result = await runVitest(suite);
    suiteMs.set(suite, Math.max(1, Date.now() - started));
    return result;
  });

  const sweepStarted = Date.now();

  // Lanes, each with its own copy of the working tree, because a mutation is a
  // write to a real file and lanes cannot share one (#807).
  let laneCount = laneCountFor(cpus().length, process.env.GUARD_MUTATION_LANES);
  if (laneCount > 1 && !hasRsync()) {
    // Said out loud rather than quietly falling back: a sweep that silently
    // stopped parallelising would just get slower, with nothing red (L289).
    console.log(
      "rsync is not available, so lane workspaces cannot be made. Running the " +
        "sweep in one lane, which is correct but slower.",
    );
    laneCount = 1;
  }
  laneCount = Math.min(laneCount, Math.max(1, sites.length));

  const lanes = partitionByCost(
    sites,
    (site) => suiteMs.get(suiteFor(site.file, site.guard)!) ?? 1,
    laneCount,
  );

  let done = 0;
  const runLane = async (root: string, laneSites: typeof sites) => {
    const found: Finding[] = [];
    for (const site of laneSites) {
      const suite = suiteFor(site.file, site.guard)!;
      const full = join(root, site.file);
      const source = readFileSync(full, "utf8");

      const result = await withMutation(full, mutate(source, site), () =>
        runVitest(suite, root),
      );
      const verdict = classifyRun(result);
      found.push({ site, suite, verdict, hollow: hollowRiskTests(result) });

      done++;
      const mark = {
        killed: "ok",
        weak: "WEAK",
        survived: "SURVIVED",
        error: "ERROR",
      }[verdict];
      console.log(
        `[${done}/${sites.length}] ${mark}  ${site.file}:${site.line} ${site.guard} (${suite})`,
      );
    }
    return found;
  };

  let byLane: Finding[][];
  if (laneCount === 1) {
    // No copy at all for a single lane: identical to how this ran before, and
    // the path a machine without rsync takes.
    console.log(`Mutating ${sites.length} sites in one lane.`);
    byLane = [await runLane(REPO_ROOT, lanes[0])];
  } else {
    console.log(
      `Mutating ${sites.length} sites across ${laneCount} lanes ` +
        `(${lanes.map((l) => l.length).join(", ")} sites, divided by measured suite time).`,
    );
    const workspaces = createLaneWorkspaces(REPO_ROOT, laneCount);
    try {
      byLane = await Promise.all(
        lanes.map((laneSites, i) => runLane(workspaces.lanes[i], laneSites)),
      );
    } finally {
      // Always: a lane left behind holds a copy of the source with a guard
      // possibly still neutralised in it.
      workspaces.cleanup();
    }
  }

  // Back into the original site order, so the report does not depend on which
  // lane happened to finish first and two runs can be diffed.
  const order = new Map(sites.map((site, index) => [site, index]));
  const findings: Finding[] = byLane
    .flat()
    .sort((a, b) => order.get(a.site)! - order.get(b.site)!);

  // Every mutant must be accounted for. A lane that lost its share would still
  // print a verdict, and a check for zero survivors catches none of it (L288).
  if (findings.length !== sites.length) {
    throw new Error(
      `The sweep ran ${findings.length} mutants but had ${sites.length} sites. ` +
        `A lane lost its share, so this result is about a partial sweep and ` +
        `means nothing.`,
    );
  }

  // A test that only went red by crashing, next to a sibling that asserted. The
  // mutant is scored killed on the sibling's strength and the crashing one is
  // certified while proving nothing (#648). Dedupe: the same test can crash
  // under several mutants of the same guard.
  const hollowByTest = new Map<string, Set<string>>();
  for (const f of findings) {
    for (const name of f.hollow) {
      const suites = hollowByTest.get(name) ?? new Set<string>();
      suites.add(f.suite);
      hollowByTest.set(name, suites);
    }
  }

  const survived = findings.filter((f) => f.verdict === "survived");
  const errored = findings.filter((f) => f.verdict === "error");
  const weak = findings.filter((f) => f.verdict === "weak");
  const killed = findings.filter((f) => f.verdict === "killed");

  const lines: string[] = [
    "## Guard mutation results",
    "",
    `Mutated ${sites.length} guard call sites. Killed ${killed.length}, weak ${weak.length}, survived ${survived.length}, inconclusive ${errored.length}.`,
    "",
  ];

  if (hollowByTest.size > 0) {
    lines.push(
      "### Red on a crash, next to a sibling that asserted",
      "",
      "The mutant was killed, but only by another test in the same file. These",
      "tests went red because the guardless code CRASHED, not because their own",
      "assertion caught it, so they would go red with their assertion deleted and",
      "they are proving nothing. Give each one a request it can actually run, so",
      "its own assertion is what fails.",
      "",
    );
    for (const [name, suites] of hollowByTest) {
      lines.push(`- \`${[...suites].join(", ")}\` :: ${name}`);
    }
    lines.push("");
  }

  if (survived.length > 0) {
    lines.push(
      "### Survived: the guard was removed and the suite still passed",
      "",
      "These tests cannot fail. They are not protecting anything.",
      "",
    );
    for (const f of survived) {
      lines.push(
        `- \`${f.site.file}:${f.site.line}\` ${f.site.guard}, unnoticed by \`${f.suite}\``,
      );
    }
    lines.push("");
  }

  if (weak.length > 0) {
    lines.push(
      "### Weak: the suite went red, but on a crash rather than an assertion",
      "",
      "With the guard removed the code ran on and threw, usually because the test hands it a fake request that only carries the fields the guard reads. CI does go red, so the guard is protected today. But the test would go red with its assertion DELETED too, which means the assertion is not what is protecting it.",
      "",
    );
    for (const f of weak) {
      lines.push(
        `- \`${f.site.file}:${f.site.line}\` ${f.site.guard}, crashed rather than asserted in \`${f.suite}\``,
      );
    }
    lines.push("");
  }

  if (errored.length > 0) {
    lines.push(
      "### Inconclusive: the suite could not run against the mutant",
      "",
      "Not a pass. Nothing was verified for these guards.",
      "",
    );
    for (const f of errored) {
      lines.push(`- \`${f.site.file}:${f.site.line}\` ${f.site.guard}`);
    }
    lines.push("");
  }

  if (unmapped.length > 0) {
    lines.push(
      "### Unmapped: no suite claims this guard",
      "",
      ...unmapped.map((s) => `- \`${s.file}:${s.line}\` ${s.guard}`),
      "",
    );
  }

  // How much of its deadline this sweep used (#807). Reported on EVERY run,
  // not only when it is in trouble: a number that only appears once it is too
  // late leaves nobody able to see the growth coming. 105 mutants took about
  // 211 seconds sequentially under a 15 minute timeout, and every new guard
  // site adds about two seconds.
  const headroom = checkSweepHeadroom({
    elapsedMs: Date.now() - sweepStarted,
    timeoutMinutes: readJobTimeoutMinutes(
      readFileSync(join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8"),
    ),
    maxFraction: SWEEP_DEADLINE_FRACTION,
  });
  lines.push("", headroom.message);

  const summary = lines.join("\n");
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  if (
    survived.length > 0 ||
    weak.length > 0 ||
    // A test that only goes red by crashing is proving nothing, and it is
    // certified anyway because a sibling in the same file asserted. Reporting it
    // and passing would leave it there, so it fails the gate like the rest (#648).
    hollowByTest.size > 0 ||
    errored.length > 0 ||
    unmapped.length > 0
  ) {
    process.exitCode = 1;
  }
}

// Only when executed directly, not when the unit tests import the functions above.
if (process.argv[1]?.endsWith("guard-mutation.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
