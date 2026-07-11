import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./require-visible-nurse-filter.mjs";

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
      plugins: { local: { rules: { "require-visible-nurse-filter": rule } } },
      rules: { "local/require-visible-nurse-filter": "error" },
    },
    "route.ts",
  );
}

function expectRejected(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/require-visible-nurse-filter");
  expect(messages[0].message).toMatch(/applyVisibleNurseFilter/);
}

function expectClean(code) {
  expect(lint(code)).toEqual([]);
}

const IMPORTS = `
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
`;

describe("require-visible-nurse-filter", () => {
  it("flags a service-role read of nurse_profiles awaited inline", () => {
    expectRejected(`${IMPORTS}
      async function load() {
        const supabase = createServiceRoleClient();
        const { data } = await supabase
          .from("nurse_profiles")
          .select("user_id, slug");
        return data;
      }
    `);
  });

  it("flags a service-role read held in a variable that is never filtered", () => {
    expectRejected(`${IMPORTS}
      async function load() {
        const supabase = createServiceRoleClient();
        const query = supabase.from("nurse_profiles").select("slug");
        const { data } = await query;
        return data;
      }
    `);
  });

  it("accepts a query wrapped in applyVisibleNurseFilter at the await", () => {
    expectClean(`${IMPORTS}
      async function load() {
        const supabase = createServiceRoleClient();
        const query = supabase.from("nurse_profiles").select("slug");
        const { data } = await applyVisibleNurseFilter(query);
        return data;
      }
    `);
  });

  it("accepts a query reassigned through applyVisibleNurseFilter", () => {
    expectClean(`${IMPORTS}
      async function load() {
        const supabase = createServiceRoleClient();
        let query = supabase.from("nurse_profiles").select("slug");
        query = applyVisibleNurseFilter(query);
        const { data } = await query;
        return data;
      }
    `);
  });

  it("ignores a read on the RLS-scoped client, where the database enforces visibility", () => {
    expectClean(`${IMPORTS}
      async function load(userId: string) {
        const supabase = await createClient();
        const { data } = await supabase
          .from("nurse_profiles")
          .select("*")
          .eq("user_id", userId);
        return data;
      }
    `);
  });

  it("ignores a service-role write, which cannot leak a hidden profile", () => {
    expectClean(`${IMPORTS}
      async function demote(userId: string) {
        const supabase = createServiceRoleClient();
        await supabase
          .from("nurse_profiles")
          .update({ tier: "free" })
          .eq("user_id", userId);
      }
    `);
  });

  it("ignores a service-role read of an unrelated table", () => {
    expectClean(`${IMPORTS}
      async function admins() {
        const supabase = createServiceRoleClient();
        const { data } = await supabase.from("users").select("id, email");
        return data;
      }
    `);
  });
});
