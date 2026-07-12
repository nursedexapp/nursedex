// @vitest-environment node
//
// #642. The three completeness suites prove a guarded surface HAS a test. They
// cannot prove the test would fail if the guard were deleted, which is the only
// property that matters, and every gap closed in #617, #629, #618, #633 and #634
// was a passing test that could not fail.
//
// These are the unit tests for the mutation runner that closes that hole. The
// runner's own correctness is the whole point: a bug here does not produce a
// wrong number, it produces a false all-clear on the authorization boundary.
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectGuardSites,
  mutate,
  suiteFor,
  classifyRun,
  assertBaselineGreen,
  withMutation,
  affectedSites,
  EXCLUDED,
} from "./guard-mutation";

const ACTION = `"use server";
import { requireAdmin, requireRole } from "@/lib/auth/helpers";

export async function suspendAccount(input: unknown) {
  const admin = await requireAdmin();
  return admin;
}

export async function toggleAvailability(on: boolean) {
  await requireRole("nurse");
  return on;
}
`;

describe("collectGuardSites", () => {
  it("finds every guard call, with the line it sits on", () => {
    const sites = collectGuardSites("src/lib/admin/account-actions.ts", ACTION);

    expect(sites.map((s) => s.guard)).toEqual(["requireAdmin", "requireRole"]);
    expect(sites[0].line).toBe(5);
    expect(sites[1].line).toBe(10);
  });

  it("ignores the import statement that names the guard", () => {
    // `import { requireAdmin }` names the guard but does not call it. Mutating
    // the import would break the module and the suite would go red for a reason
    // that has nothing to do with the boundary.
    const sites = collectGuardSites("a.ts", ACTION);
    expect(sites.every((s) => s.line !== 2)).toBe(true);
  });

  it("ignores a guard named only in a comment", () => {
    // The same false positive #644 describes in the route coverage check: a
    // commented-out guard must not read as a live call site.
    const src = `// calls requireAdmin() before writing
/* requireSuperAdmin() used to guard this */
export async function x() { return 1; }
`;
    expect(collectGuardSites("a.ts", src)).toEqual([]);
  });

  it("finds no site in a file with no guard at all", () => {
    expect(collectGuardSites("a.ts", "export const x = 1;\n")).toEqual([]);
  });

  it("treats getCurrentUser as a guard inside an API route", () => {
    // In a route it IS the authentication check: null means 401.
    const src = `const user = await getCurrentUser();
if (!user) return NextResponse.json({}, { status: 401 });
`;
    const sites = collectGuardSites("src/app/api/x/route.ts", src);
    expect(sites.map((s) => s.guard)).toEqual(["getCurrentUser"]);
  });

  it("treats getCurrentUser as a guard inside a server action", () => {
    // #681. The skip below was justified for pages, where getCurrentUser refuses
    // nobody. But a server action is a publicly callable endpoint, and there it
    // IS the authentication: null means the action returns not_authenticated and
    // does nothing. Skipping it there meant nothing ever proved those guards
    // could fail, across five action files.
    const src = `"use server";
const user = await getCurrentUser();
if (!user) return { success: false, error: "not_authenticated" };
`;
    const sites = collectGuardSites("src/lib/nurses/saves-actions.ts", src);
    expect(sites.map((s) => s.guard)).toEqual(["getCurrentUser"]);
  });

  it("still ignores getCurrentUser in a lib file that is not a server action", () => {
    // A plain helper reading the current user is not an authorization decision.
    const src = `const user = await getCurrentUser();
export const isMember = Boolean(user);
`;
    expect(collectGuardSites("src/lib/nurses/queries.ts", src)).toEqual([]);
  });

  it("ignores getCurrentUser in a page or layout, where it refuses nobody", () => {
    // The dashboard layout reads it to choose a sidebar and happily renders for
    // a signed-out visitor; the pages under it are guarded by require* instead.
    // Counting it as a guard reports a survivor for a line that never protected
    // anything, and a report full of false alarms is a report nobody reads.
    const src = `const user = await getCurrentUser();
const role = user?.role ?? null;
`;
    expect(collectGuardSites("src/app/(dashboard)/layout.tsx", src)).toEqual(
      [],
    );
  });
});

describe("mutate: a neutralized guard admits every caller", () => {
  // Deleting the line outright is what the issue literally asks for, and it is
  // wrong: `const admin = await requireAdmin()` becomes a module referencing an
  // undefined binding, the suite goes red on the breakage, and the mutant is
  // scored KILLED even though the test detected nothing. That false green is the
  // exact failure this job exists to catch. So each guard is instead rewritten
  // to its own "admitted" outcome: the module still runs, only the refusal is gone.

  it("turns requireAdmin into a resolved super_admin, keeping the assignment", () => {
    const [site] = collectGuardSites("a.ts", ACTION);
    const out = mutate(ACTION, site);

    expect(out).toContain("const admin = await Promise.resolve({");
    expect(out).toContain('role: "super_admin"');
    expect(out).not.toContain("await requireAdmin()");
    // Everything else survives untouched.
    expect(out).toContain('await requireRole("nurse")');
  });

  it("gives requireRole the very role it demanded, so only the refusal is removed", () => {
    // A page that demanded "nurse" goes on to use the user as a nurse. Handing
    // it a super_admin would break it for an unrelated reason.
    const site = collectGuardSites("a.ts", ACTION)[1];
    const out = mutate(ACTION, site);

    expect(out).toContain('role: "nurse"');
    expect(out).not.toContain('await requireRole("nurse")');
  });

  it("turns verifyCronAuth into null, which is its admitted value", () => {
    const src = `const authError = verifyCronAuth(request);
if (authError) return authError;
`;
    const [site] = collectGuardSites("src/app/api/cron/x/route.ts", src);
    const out = mutate(src, site);

    expect(out).toContain("const authError = null;");
    expect(out).toContain("if (authError) return authError;");
  });

  it("turns a boolean secret check into true, even inside a negated if", () => {
    const src = `if (!verifyBearerSecret(auth, process.env.CRON_SECRET)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
`;
    const [site] = collectGuardSites("src/app/api/x/route.ts", src);
    const out = mutate(src, site);

    expect(out).toContain("if (!true) {");
  });

  it("handles a call whose arguments contain parentheses", () => {
    // A naive scan to the first ")" would cut the call in half and leave a
    // syntax error, which the runner would then misread as a killed mutant.
    const src = `if (!verifySignature(rawBody, new Headers(h), secret)) return bad();\n`;
    const [site] = collectGuardSites("src/app/api/x/route.ts", src);
    const out = mutate(src, site);

    expect(out).toBe("if (!true) return bad();\n");
  });
});

describe("inline role checks are guards too (#683)", () => {
  // getCurrentUser answers WHO is calling. The line after it answers WHETHER
  // they may, and in a member-facing action that line is written by hand:
  // `if (user.role !== "family") return { error: "wrong_role" }`. It is not a
  // call to anything, so the guard collector could not see it, and nothing ever
  // proved it could fail. Deleting it from revealNurse would let a NURSE reveal
  // another nurse's contact details.
  it("finds a hand-written role check in a server action", () => {
    const src = `"use server";
const user = await getCurrentUser();
if (!user) return { success: false, error: "not_authenticated" };
if (user.role !== "family") return { success: false, error: "wrong_role" };
`;
    const sites = collectGuardSites("src/lib/reveals/actions.ts", src);
    expect(sites.map((s) => s.guard)).toEqual(["getCurrentUser", "role-check"]);
  });

  it("admits every role when the check is neutralized, and refuses nobody else", () => {
    // Neutralizing must remove ONLY the role refusal. `!user ||` has to survive,
    // or the mutant would also delete the authentication and a test could go red
    // for the wrong reason.
    const src = `"use server";
const user = await getCurrentUser();
if (!user || user.role !== "family") return false;
`;
    const site = collectGuardSites("src/lib/reveals/actions.ts", src).find(
      (s) => s.guard === "role-check",
    )!;
    expect(mutate(src, site)).toContain("if (!user || false) return false;");
  });

  it("ignores a role comparison on a row that is not the caller", () => {
    // The precision that decides whether this is a boundary check at all.
    // `target.role !== "admin"` in demoteAdmin asks whether the person being
    // demoted IS an admin, and claimHireByEmail asks whether the email it looked
    // up belongs to a family. Neither refuses the CALLER, and mutating them
    // reports a survivor for a line that never guarded the boundary.
    const src = `"use server";
const user = await getCurrentUser();
if (target.role !== "admin") return { error: "wrong_state" };
if (family.role !== "family") return { error: "email_not_found" };
`;
    const sites = collectGuardSites("src/lib/admin/role-actions.ts", src);
    expect(sites.map((s) => s.guard)).toEqual(["getCurrentUser"]);
  });

  it("ignores a role comparison that is not a refusal", () => {
    // `role === "family"` picks a branch; it turns nobody away. The dashboard
    // layout does exactly this to choose a sidebar.
    const src = `"use server";\nif (user.role === "family") showFamilyThing();\n`;
    expect(collectGuardSites("src/lib/x/actions.ts", src)).toEqual([]);
  });
});

describe("suiteFor: which suite is supposed to catch this guard", () => {
  it.each([
    [
      "src/lib/admin/account-actions.ts",
      "src/lib/admin/authz-boundary.test.ts",
    ],
    ["src/lib/blog/actions.ts", "src/lib/admin/authz-boundary.test.ts"],
    ["src/app/(admin)/layout.tsx", "src/app/page-authz-boundary.test.tsx"],
    [
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/app/page-authz-boundary.test.tsx",
    ],
    [
      "src/app/api/cron/hire-followup/route.ts",
      "src/app/api/cron/hire-followup/route.test.ts",
    ],
    ["src/lib/email/route-handler.ts", "src/lib/email/route-handler.test.ts"],
  ])("%s is covered by %s", (file, suite) => {
    expect(suiteFor(file)).toBe(suite);
  });

  it("sends a member action's getCurrentUser guard to the action boundary suite", () => {
    // #681. Which suite is responsible depends on the GUARD, not only the file.
    // blog/actions.ts guards with requireAdmin, which the admin boundary suite
    // proves; reveals/actions.ts authenticates with getCurrentUser, which only
    // the action boundary suite proves. Routing by file alone sent one of them
    // to a suite that had never heard of it.
    expect(suiteFor("src/lib/reveals/actions.ts", "getCurrentUser")).toBe(
      "src/lib/action-authz-boundary.test.ts",
    );
    expect(suiteFor("src/lib/reviews/actions.ts", "getCurrentUser")).toBe(
      "src/lib/action-authz-boundary.test.ts",
    );
  });

  it("keeps a require* guard in the same file with the admin boundary suite", () => {
    // reviews/actions.ts has both kinds. The require* ones were already proven
    // by the admin suite and must stay there.
    expect(suiteFor("src/lib/blog/actions.ts", "requireAdmin")).toBe(
      "src/lib/admin/authz-boundary.test.ts",
    );
    expect(suiteFor("src/lib/hires/actions.ts", "requireRole")).toBe(
      "src/lib/admin/authz-boundary.test.ts",
    );
  });

  it("returns null for a file no suite claims, rather than guessing", () => {
    // An unmapped guard must surface as an error, not be silently skipped: a
    // skipped guard is an unverified guard.
    expect(suiteFor("src/lib/something/new.ts")).toBeNull();
  });
});

describe("affectedSites: what a pull request has to re-prove", () => {
  const sites = [
    {
      file: "src/lib/blog/actions.ts",
      line: 5,
      index: 0,
      guard: "requireAdmin",
    },
    {
      file: "src/lib/admin/role-actions.ts",
      line: 9,
      index: 0,
      guard: "requireSuperAdmin",
    },
    {
      file: "src/app/api/cron/sla-alerts/route.ts",
      line: 3,
      index: 0,
      guard: "verifyCronAuth",
    },
  ];

  it("re-proves a guard whose own file changed", () => {
    expect(
      affectedSites(sites, ["src/lib/blog/actions.ts"]).map((s) => s.file),
    ).toEqual(["src/lib/blog/actions.ts"]);
  });

  it("re-proves every guard a suite covers when that SUITE changed", () => {
    // The hole a naive "only mutate changed source files" check leaves wide
    // open: weakening a test does not touch the guard it was protecting. Someone
    // stubbing requireAdmin inside the boundary suite changes only the test
    // file, so every guard that suite is responsible for has to be re-proven.
    const affected = affectedSites(sites, [
      "src/lib/admin/authz-boundary.test.ts",
    ]);
    expect(affected.map((s) => s.file)).toEqual([
      "src/lib/blog/actions.ts",
      "src/lib/admin/role-actions.ts",
    ]);
  });

  it("re-proves everything when the mutation runner itself changed", () => {
    expect(affectedSites(sites, ["scripts/guard-mutation.ts"])).toHaveLength(3);
  });

  it("selects nothing for a change that touches no guard and no suite", () => {
    expect(affectedSites(sites, ["src/components/Button.tsx"])).toEqual([]);
  });
});

describe("classifyRun: a broken mutant must never count as killed", () => {
  it("calls a mutant SURVIVED when the suite still passes", () => {
    // The finding we exist to produce: the guard is gone and the test is happy.
    expect(
      classifyRun({ exitCode: 0, numTotalTests: 68, numFailedTests: 0 }),
    ).toBe("survived");
  });

  it("calls a mutant KILLED when a test fails on an assertion", () => {
    expect(
      classifyRun({
        exitCode: 1,
        numTotalTests: 68,
        numFailedTests: 1,
        failureMessages: ["AssertionError: expected 200 to be 401"],
      }),
    ).toBe("killed");
  });

  it("calls it WEAK when the suite only went red because the code crashed", () => {
    // The subtle one. With the guard gone, the route runs on and throws, because
    // the test hands it a fake request carrying only the fields the guard reads.
    // The suite goes red, so CI is protected, but it would go red with the 401
    // assertion DELETED too: the assertion is not what is protecting the route,
    // and the test could be hollowed out without anything noticing. Scoring this
    // a plain kill would certify precisely the test #642 says cannot fail.
    expect(
      classifyRun({
        exitCode: 1,
        numTotalTests: 3,
        numFailedTests: 2,
        failureMessages: [
          "TypeError: Cannot read properties of undefined (reading 'ts')",
          "TypeError: Cannot read properties of undefined (reading 'ts')",
        ],
      }),
    ).toBe("weak");
  });

  it("counts the mutant as killed when at least one failure IS an assertion", () => {
    // A suite where one test crashes but another genuinely asserts the refusal
    // is still doing its job.
    expect(
      classifyRun({
        exitCode: 1,
        numTotalTests: 4,
        numFailedTests: 2,
        failureMessages: [
          "TypeError: Cannot read properties of undefined (reading 'searchParams')",
          "AssertionError: expected 400 to be 401",
        ],
      }),
    ).toBe("killed");
  });

  it("calls a mutant KILLED when a test fails with no message to judge by", () => {
    // Never invent a failure reason that was not reported.
    expect(
      classifyRun({ exitCode: 1, numTotalTests: 68, numFailedTests: 1 }),
    ).toBe("killed");
  });

  it("calls it ERROR when the suite never ran, not killed", () => {
    // A mutation that breaks the module makes vitest fail to collect: zero tests
    // run and the exit code is non-zero, which looks EXACTLY like a killed
    // mutant if you only check the exit code. Scoring that as killed would
    // certify a guard as tested when nothing tested it.
    expect(
      classifyRun({ exitCode: 1, numTotalTests: 0, numFailedTests: 0 }),
    ).toBe("error");
  });

  it("calls it ERROR when the run failed with no failing test to show for it", () => {
    expect(
      classifyRun({ exitCode: 1, numTotalTests: 68, numFailedTests: 0 }),
    ).toBe("error");
  });
});

describe("assertBaselineGreen", () => {
  it("throws when a suite is already red before any mutation", async () => {
    // If the suite is red to begin with, every mutant "fails" and every guard is
    // certified. The run has to stop instead of reporting a clean sweep.
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      numTotalTests: 68,
      numFailedTests: 2,
    });

    await expect(
      assertBaselineGreen(["src/lib/admin/authz-boundary.test.ts"], run),
    ).rejects.toThrow(/already failing/i);
  });

  it("throws when a baseline suite runs no tests at all", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, numTotalTests: 0, numFailedTests: 0 });

    await expect(assertBaselineGreen(["x.test.ts"], run)).rejects.toThrow(
      /no tests/i,
    );
  });

  it("passes when every suite is green", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, numTotalTests: 68, numFailedTests: 0 });

    await expect(
      assertBaselineGreen(["x.test.ts"], run),
    ).resolves.toBeUndefined();
  });
});

describe("withMutation always puts the file back", () => {
  it("restores the original after a normal run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-mutation-"));
    const file = join(dir, "a.ts");
    writeFileSync(file, ACTION);

    await withMutation(file, "MUTATED", async () => {
      expect(readFileSync(file, "utf8")).toBe("MUTATED");
    });

    expect(readFileSync(file, "utf8")).toBe(ACTION);
    rmSync(dir, { recursive: true, force: true });
  });

  it("restores the original when the run throws", async () => {
    // The failure path that matters most. This runner edits real source files in
    // the working tree; a crash mid-run that left a guard neutralized on disk
    // could be committed, which would be this job DISABLING a guard it was
    // written to protect.
    const dir = mkdtempSync(join(tmpdir(), "guard-mutation-"));
    const file = join(dir, "a.ts");
    writeFileSync(file, ACTION);

    await expect(
      withMutation(file, "MUTATED", async () => {
        throw new Error("vitest exploded");
      }),
    ).rejects.toThrow("vitest exploded");

    expect(readFileSync(file, "utf8")).toBe(ACTION);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("EXCLUDED", () => {
  it("excludes the Stripe webhook, with a stated reason", () => {
    // Stripe's check refuses by THROWING, not by returning a no. Neutralizing it
    // means fabricating a whole valid payment event for the handler to process,
    // which tests the fabrication, not the guard. Excluded on purpose, and said
    // out loud: the Stripe webhook's guard test is NOT proven able to fail.
    expect(EXCLUDED["src/app/api/stripe/webhook/route.ts"]).toMatch(/throw/i);
  });

  it("excludes the files that DEFINE the guards, which are not call sites", () => {
    expect(EXCLUDED["src/lib/auth/helpers.ts"]).toBeTruthy();
    expect(EXCLUDED["src/lib/cron/auth.ts"]).toBeTruthy();
    expect(EXCLUDED["src/lib/security/shared-secret.ts"]).toBeTruthy();
  });
});
