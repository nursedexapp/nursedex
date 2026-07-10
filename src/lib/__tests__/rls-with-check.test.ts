import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  findPoliciesMissingWithCheck,
  formatViolations,
  policyKey,
  type PolicyRow,
} from "../../../scripts/rls-with-check";

// Issue #513. PR #511 fixed three findings that all traced to one omission: a
// `FOR UPDATE` policy with `USING (owner = auth.uid())` and no `WITH CHECK`.
// Postgres then reuses USING as the check, letting the row's owner rewrite any
// column on it. #512 found a fourth instance the audit had missed. This test
// reads the APPLIED policies out of pg_policies so a new migration cannot
// reintroduce the pattern.
//
// Deliberately not a scan of supabase/migrations/*.sql: those files hold 93
// CREATE POLICY and 28 DROP POLICY statements, so their text contains
// superseded definitions the database no longer enforces.

/**
 * Policies that are genuinely fine without a WITH CHECK. Every entry needs a
 * written reason. An entry that stops matching a real policy fails the test,
 * so an exemption cannot outlive the policy it was written for.
 */
const ALLOWED_WITHOUT_WITH_CHECK: readonly string[] = [
  // (empty) PR #511 and #512 added an explicit WITH CHECK to every owner-scoped
  // UPDATE policy. If CI reports a violation here, add it with a justification
  // rather than deleting the assertion.
];

// Never read this from .env.local: that file holds PRODUCTION credentials for
// this repo. Default to the local stack and refuse anything else outright.
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Refusing to run the RLS WITH CHECK guard against a non-local database (${host}). ` +
        "This test creates and drops a probe table and must only run against a throwaway stack.",
    );
  }
}

const PROBE_TABLE = "rls_with_check_probe";

let client: Client;
let policies: PolicyRow[];

async function readPolicies(): Promise<PolicyRow[]> {
  const { rows } = await client.query<PolicyRow>(
    `SELECT schemaname, tablename, policyname, cmd, qual, with_check
       FROM pg_policies`,
  );
  return rows;
}

beforeAll(async () => {
  assertLocalDatabase(DB_URL);
  client = new Client({ connectionString: DB_URL });
  await client.connect();
  policies = await readPolicies();
});

afterAll(async () => {
  if (client) {
    await client.query(`DROP TABLE IF EXISTS public.${PROBE_TABLE} CASCADE`);
    await client.end();
  }
});

describe("every owner-scoped UPDATE/ALL policy has an explicit WITH CHECK", () => {
  it("finds no unguarded policies in the applied schema", () => {
    const violations = findPoliciesMissingWithCheck(
      policies,
      ALLOWED_WITHOUT_WITH_CHECK,
    );
    expect(formatViolations(violations)).toBe(
      "Every owner-scoped UPDATE/ALL policy has an explicit WITH CHECK.",
    );
  });

  it("read a real, non-empty policy set (the query actually ran)", () => {
    // Guards against the whole suite passing because pg_policies came back
    // empty and there was simply nothing to find.
    expect(policies.length).toBeGreaterThan(50);
  });
});

// A guard added to an already-clean database passes on day one whether or not
// it works. Prove it bites by reintroducing the exact #512 shape.
describe("the guard actually catches the bug class", () => {
  it("flags a FOR UPDATE policy created without a WITH CHECK", async () => {
    try {
      await client.query(`
        CREATE TABLE public.${PROBE_TABLE} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_id uuid NOT NULL,
          is_paid boolean NOT NULL DEFAULT false
        );
        ALTER TABLE public.${PROBE_TABLE} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${PROBE_TABLE}_update_own ON public.${PROBE_TABLE}
          FOR UPDATE USING (owner_id = auth.uid());
      `);

      const withProbe = await readPolicies();
      const violations = findPoliciesMissingWithCheck(
        withProbe,
        ALLOWED_WITHOUT_WITH_CHECK,
      );

      expect(violations.map(policyKey)).toContain(
        `public.${PROBE_TABLE}.${PROBE_TABLE}_update_own`,
      );
      expect(formatViolations(violations)).toMatch(/WITH CHECK <missing>/);
    } finally {
      await client.query(`DROP TABLE IF EXISTS public.${PROBE_TABLE} CASCADE`);
    }
  });

  it("stops flagging it once a WITH CHECK is added", async () => {
    try {
      await client.query(`
        CREATE TABLE public.${PROBE_TABLE} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_id uuid NOT NULL
        );
        ALTER TABLE public.${PROBE_TABLE} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${PROBE_TABLE}_update_own ON public.${PROBE_TABLE}
          FOR UPDATE USING (owner_id = auth.uid())
          WITH CHECK (owner_id = auth.uid());
      `);

      const withProbe = await readPolicies();
      const violations = findPoliciesMissingWithCheck(
        withProbe,
        ALLOWED_WITHOUT_WITH_CHECK,
      );

      expect(violations.map(policyKey)).not.toContain(
        `public.${PROBE_TABLE}.${PROBE_TABLE}_update_own`,
      );
    } finally {
      await client.query(`DROP TABLE IF EXISTS public.${PROBE_TABLE} CASCADE`);
    }
  });
});

describe("the local-only guard", () => {
  it("refuses to run against a remote database", () => {
    expect(() =>
      assertLocalDatabase(
        "postgresql://postgres:pw@db.abcdefg.supabase.co:5432/postgres",
      ),
    ).toThrow(/non-local database/i);
  });
});
