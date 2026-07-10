// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  findPoliciesMissingWithCheck,
  formatViolations,
  policyKey,
  type PolicyRow,
} from "./rls-with-check";

function row(overrides: Partial<PolicyRow>): PolicyRow {
  return {
    schemaname: "public",
    tablename: "hires",
    policyname: "hires_update_own",
    cmd: "UPDATE",
    qual: "(family_user_id = auth.uid())",
    with_check: null,
    ...overrides,
  };
}

describe("findPoliciesMissingWithCheck", () => {
  // The #511/#512 bug class: FOR UPDATE with USING but no WITH CHECK. Postgres
  // silently reuses USING as the check, so the owner may rewrite ANY column on
  // their own row as long as it still belongs to them.
  it("flags a FOR UPDATE policy with no WITH CHECK", () => {
    const found = findPoliciesMissingWithCheck([row({})], []);
    expect(found.map(policyKey)).toEqual(["public.hires.hires_update_own"]);
  });

  it("flags a FOR ALL policy with no WITH CHECK", () => {
    const found = findPoliciesMissingWithCheck(
      [
        row({
          cmd: "ALL",
          tablename: "reveals",
          policyname: "reveals_all_own",
        }),
      ],
      [],
    );
    expect(found.map(policyKey)).toEqual(["public.reveals.reveals_all_own"]);
  });

  it("accepts a FOR UPDATE policy that has a WITH CHECK", () => {
    const rows = [row({ with_check: "(family_user_id = auth.uid())" })];
    expect(findPoliciesMissingWithCheck(rows, [])).toEqual([]);
  });

  // Postgres rejects USING on a FOR INSERT policy, so an INSERT policy always
  // carries a WITH CHECK and can never exhibit this bug. SELECT and DELETE
  // have no WITH CHECK clause at all.
  it("ignores INSERT, SELECT and DELETE policies", () => {
    const rows = [
      row({ cmd: "INSERT", with_check: "(true)", qual: null }),
      row({ cmd: "SELECT", with_check: null }),
      row({ cmd: "DELETE", with_check: null }),
    ];
    expect(findPoliciesMissingWithCheck(rows, [])).toEqual([]);
  });

  it("skips an allowlisted policy", () => {
    const rows = [
      row({
        tablename: "family_profiles",
        policyname: "family_profiles_update_own",
      }),
    ];
    const allowed = ["public.family_profiles.family_profiles_update_own"];
    expect(findPoliciesMissingWithCheck(rows, allowed)).toEqual([]);
  });

  it("still flags a non-allowlisted policy on an allowlisted table", () => {
    const rows = [
      row({
        tablename: "family_profiles",
        policyname: "family_profiles_update_own",
      }),
      row({
        tablename: "family_profiles",
        policyname: "family_profiles_update_admin",
      }),
    ];
    const allowed = ["public.family_profiles.family_profiles_update_own"];
    const found = findPoliciesMissingWithCheck(rows, allowed);
    expect(found.map(policyKey)).toEqual([
      "public.family_profiles.family_profiles_update_admin",
    ]);
  });

  it("only considers the public schema, not Supabase's internal ones", () => {
    const rows = [row({ schemaname: "storage", policyname: "objects_update" })];
    expect(findPoliciesMissingWithCheck(rows, [])).toEqual([]);
  });

  // Fail loud, not silent. An empty result set means the catalog query failed
  // or ran against the wrong database. Reporting "no violations" there is a
  // false all-clear on exactly the condition this guard exists to catch.
  it("throws on an empty row set rather than reporting a clean bill of health", () => {
    expect(() => findPoliciesMissingWithCheck([], [])).toThrow(/no policies/i);
  });

  it("throws when an allowlist entry no longer matches any policy", () => {
    // A stale allowlist entry means a policy was renamed or dropped and the
    // exemption is now silently protecting nothing, or worse, would protect a
    // future policy that reuses the name.
    expect(() =>
      findPoliciesMissingWithCheck(
        [row({ with_check: "(true)" })],
        ["public.gone.gone_update_own"],
      ),
    ).toThrow(/stale allowlist/i);
  });
});

describe("formatViolations", () => {
  it("names each offending policy and says what to do", () => {
    const message = formatViolations([row({})]);
    expect(message).toMatch(/public\.hires\.hires_update_own/);
    expect(message).toMatch(/WITH CHECK/);
  });
});
