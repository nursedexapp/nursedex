import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-mocked-auth-guard.mjs";

const linter = new Linter();

/** Lint a snippet with only our rule enabled, returning its messages. */
function lint(code) {
  return linter.verify(
    code,
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
      plugins: { local: { rules: { "no-mocked-auth-guard": rule } } },
      rules: { "local/no-mocked-auth-guard": "error" },
    },
    "route.test.ts",
  );
}

function expectRejected(code, matcher) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/no-mocked-auth-guard");
  if (matcher) expect(messages[0].message).toMatch(matcher);
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

describe("no-mocked-auth-guard: the circular tests it was written for", () => {
  // The exact shape from #618: the four cron tests stubbed the guard, then
  // asserted the route returned the stub's own 401.
  it("flags a cron test replacing verifyCronAuth with a stub", () => {
    expectRejected(
      `vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: h.verifyCronAuth }));`,
      /verifyCronAuth/,
    );
  });

  it("flags an admin test replacing requireAdmin with an always-admin stub", () => {
    expectRejected(
      `vi.mock("@/lib/auth/helpers", () => ({
         requireAdmin: async () => ({ id: "admin-1" }),
       }));`,
      /requireAdmin/,
    );
  });

  it("flags requireSuperAdmin", () => {
    expectRejected(
      `vi.mock("@/lib/auth/helpers", () => ({ requireSuperAdmin: vi.fn() }));`,
      /requireSuperAdmin/,
    );
  });

  it("flags requireRole, the nurse-only / family-only check", () => {
    expectRejected(
      `vi.mock("@/lib/auth/helpers", () => ({
         requireRole: async () => ({ id: "nurse-1" }),
       }));`,
      /requireRole/,
    );
  });

  it("flags the constant-time secret verifier", () => {
    expectRejected(
      `vi.mock("@/lib/security/shared-secret", () => ({
         verifyBearerSecret: () => true,
       }));`,
      /verifyBearerSecret/,
    );
  });

  it("flags auto-mocking a guard module, which replaces every export", () => {
    expectRejected(`vi.mock("@/lib/cron/auth");`, /every export/);
  });

  it("sees through a block-bodied factory", () => {
    expectRejected(
      `vi.mock("@/lib/auth/helpers", () => {
         return { requireAdmin: vi.fn() };
       });`,
      /requireAdmin/,
    );
  });

  it("sees through a string-keyed property", () => {
    expectRejected(
      `vi.mock("@/lib/cron/auth", () => ({ "verifyCronAuth": vi.fn() }));`,
      /verifyCronAuth/,
    );
  });
});

describe("no-mocked-auth-guard: what it must NOT flag", () => {
  // getCurrentUser answers "who is calling", not "may they". The boundary suite
  // drives a caller's identity this way while running the REAL guard on top.
  // Banning it would leave no way to set up a caller and would push people
  // toward mocking the guard, which is the thing this rule exists to prevent.
  it("allows mocking getCurrentUser, the session source", () => {
    expectClean(
      `vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: h.getCurrentUser }));`,
    );
  });

  it("allows mocking the Supabase client the guard reads through", () => {
    expectClean(
      `vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.client() }));`,
    );
  });

  it("allows mocking unrelated collaborators", () => {
    expectClean(
      `vi.mock("@/lib/email/send", () => ({ sendReviewInviteEmail: vi.fn() }));`,
    );
  });

  it("does not flag a guard imported and used for real", () => {
    expectClean(
      `import { requireAdmin } from "@/lib/auth/helpers";
       it("refuses a family", async () => {
         await expect(requireAdmin()).rejects.toThrow();
       });`,
    );
  });

  it("does not flag a local variable that merely shares the name", () => {
    expectClean(`const requireAdmin = true;\nexport { requireAdmin };`);
  });
});
