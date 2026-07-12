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
import { tmpdir } from "node:os";

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..");

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
function maskNonCode(src: string): string {
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
    // A member-facing action authenticates with getCurrentUser and refuses by
    // returning an error. Nothing proved those guards could fail until #681,
    // when all ten survived the first time the gate was pointed at them.
    if (guard === "getCurrentUser") {
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

export interface RunResult {
  exitCode: number;
  numTotalTests: number;
  numFailedTests: number;
  /** Why each failing test failed, from vitest's json report. */
  failureMessages?: string[];
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

function runVitest(suite: string): Promise<RunResult> {
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
      { cwd: REPO_ROOT, stdio: "ignore" },
    );

    child.on("close", (code) => {
      let numTotalTests = 0;
      let numFailedTests = 0;
      let failureMessages: string[] = [];
      try {
        const json = JSON.parse(readFileSync(outFile, "utf8"));
        numTotalTests = json.numTotalTests ?? 0;
        numFailedTests = json.numFailedTests ?? 0;
        failureMessages = (json.testResults ?? []).flatMap(
          (file: { assertionResults?: { failureMessages?: string[] }[] }) =>
            (file.assertionResults ?? []).flatMap(
              (a) => a.failureMessages ?? [],
            ),
        );
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
  await assertBaselineGreen(suites, runVitest);

  const findings: Finding[] = [];
  let done = 0;

  for (const site of sites) {
    const suite = suiteFor(site.file, site.guard)!;
    const full = join(REPO_ROOT, site.file);
    const source = readFileSync(full, "utf8");

    const result = await withMutation(full, mutate(source, site), () =>
      runVitest(suite),
    );
    const verdict = classifyRun(result);
    findings.push({ site, suite, verdict });

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

  const summary = lines.join("\n");
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  if (
    survived.length > 0 ||
    weak.length > 0 ||
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
