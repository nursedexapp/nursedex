import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-hand-rolled-page-guard.mjs";

const linter = new Linter();

function lint(code) {
  return linter.verify(
    code,
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          ecmaFeatures: { jsx: true },
        },
      },
      plugins: { local: { rules: { "no-hand-rolled-page-guard": rule } } },
      rules: { "local/no-hand-rolled-page-guard": "error" },
    },
    "page.tsx",
  );
}

function expectRejected(code, matcher) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/no-hand-rolled-page-guard");
  if (matcher) expect(messages[0].message).toMatch(matcher);
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

// #649. A page that reads getCurrentUser() and refuses the caller by hand IS
// guarded in practice, but it is invisible to both of the checks that are meant
// to prove our pages are guarded:
//
//   - the page completeness check only counts a page as guarded when it calls
//     requireAuth / requireRole / requireAdmin / requireSuperAdmin, so it would
//     never demand a boundary test for it;
//   - the guard mutation gate deliberately skips getCurrentUser outside API
//     routes, so it would never prove the guard could fail.
//
// Nothing does this today. The cheapest fix is to make the pattern impossible
// rather than teach two checks to recognise it, which is what this rule does.

describe("refusing a caller by hand in a page", () => {
  it("rejects redirecting because there is no user", () => {
    expectRejected(
      `
      import { getCurrentUser } from "@/lib/auth/helpers";
      import { redirect } from "next/navigation";
      export default async function Page() {
        const user = await getCurrentUser();
        if (!user) redirect("/login");
        return <div>{user.id}</div>;
      }
      `,
      /requireAuth/,
    );
  });

  it("rejects a null check spelled any of the usual ways", () => {
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        if (user === null) {
          redirect("/login");
        }
        return null;
      }
    `);
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const me = await getCurrentUser();
        if (!me?.id) {
          notFound();
        }
        return null;
      }
    `);
  });

  it("rejects a hand-rolled role gate", () => {
    // The authorization half. requireRole is what keeps a family out of a
    // nurse's surfaces, and a hand-rolled version is proven by nothing.
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        if (user.role !== "admin") redirect("/");
        return null;
      }
    `);
  });

  it("rejects the one-liner spellings that carry no if at all", () => {
    // The shape that got past the first version of this rule. A guard does not
    // need an `if` to be a guard, and a rule that only understands one spelling
    // is a rule that only half works.
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        user || redirect("/login");
        return null;
      }
    `);
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        !user && redirect("/login");
        return null;
      }
    `);
  });

  it("rejects a refusal reached through a ternary", () => {
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        !user ? redirect("/login") : null;
        return null;
      }
    `);
  });

  it("rejects it when the refusal is buried in an else or a block", () => {
    expectRejected(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        if (!user) {
          logSomething();
          redirect("/login");
        }
        return null;
      }
    `);
  });
});

describe("what the rule must not flag", () => {
  it("leaves a page alone that uses the real guard", () => {
    expectClean(`
      import { requireAuth } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await requireAuth();
        return <div>{user.id}</div>;
      }
    `);
  });

  it("leaves a page alone that reads the user only to render", () => {
    // The commonest shape: a public page that shows a Sign in link to a
    // stranger and a dashboard link to a member. It refuses nobody.
    expectClean(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page() {
        const user = await getCurrentUser();
        return <div>{user ? "Hi" : "Sign in"}</div>;
      }
    `);
  });

  it("leaves a business redirect alone", () => {
    // The dashboard layout really does this: a family with no zip has not
    // finished onboarding, so send them to finish it. It is not an auth guard,
    // it turns nobody away, and the pages beneath it carry the real guard.
    expectClean(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Layout({ children }) {
        const user = await getCurrentUser();
        const role = user?.role ?? null;
        if (role === "family" && !profile?.zip_code) {
          redirect("/onboarding/family");
        }
        return <div>{children}</div>;
      }
    `);
  });

  it("leaves a redirect alone that has nothing to do with the user", () => {
    // Slug canonicalisation, which nurses/[slug] does.
    expectClean(`
      import { getCurrentUser } from "@/lib/auth/helpers";
      export default async function Page({ params }) {
        const user = await getCurrentUser();
        if (params.slug !== canonical) redirect("/nurses/" + canonical);
        return null;
      }
    `);
  });
});
