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
 * Policies reviewed and found safe without an explicit WITH CHECK. Every entry
 * carries the reason. An entry that stops matching a real policy fails the
 * test, so an exemption cannot outlive the policy it was written for.
 *
 * PR #511 hardened this bug class with BEFORE UPDATE triggers rather than by
 * adding WITH CHECK, which is why these read as "missing" but are not holes.
 * The trigger, not the policy, is what pins the protected columns. Each
 * trigger's behaviour is covered by rls-hardening.test.ts.
 */
const ALLOWED_WITHOUT_WITH_CHECK: readonly string[] = [
  // guard_users_protected_columns (BEFORE UPDATE ON users) rejects any change
  // to role, is_suspended or is_deleted from a non-admin, non-service caller.
  "public.users.users_update_own",
  // USING (is_admin()) already restricts this to admins, and the trigger above
  // still governs what an admin may change.
  "public.users.users_update_admin",

  // guard_nurse_profiles_protected_columns (BEFORE UPDATE ON nurse_profiles).
  "public.nurse_profiles.nurse_profiles_update_own",
  "public.nurse_profiles.nurse_profiles_update_admin",

  // guard_hires_self_write (BEFORE INSERT OR UPDATE ON hires) blocks a nurse
  // confirming their own hire and blocks reassigning a hire to another nurse.
  "public.hires.hires_update_family",
  "public.hires.hires_update_nurse",

  // guard_reviews_self_write (BEFORE UPDATE ON reviews) blocks self-approval
  // and blocks submitting under another user's identity.
  "public.reviews.reviews_update_reviewer",
  "public.reviews.reviews_update_nurse_response",
  "public.reviews.reviews_update_admin",

  // No trigger, and none needed. USING (user_id = auth.uid()) is reused as the
  // new-row check, so user_id itself cannot be reassigned. The only other
  // columns are zip_code, communication_preference and survey_completed, all of
  // which are the owner's own preferences and theirs to set.
  "public.family_profiles.family_profiles_update_own",

  // USING (public.is_admin()) restricts this to admins, whose intended use is
  // exactly to set is_read and admin_notes. The INSERT shape was hardened in
  // #523 so a submitter cannot pre-set those columns.
  "public.contact_submissions.contact_update_admin",
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

describe("every UPDATE/ALL policy has a WITH CHECK or a reviewed exemption", () => {
  it("finds no unreviewed policies in the applied schema", () => {
    const violations = findPoliciesMissingWithCheck(
      policies,
      ALLOWED_WITHOUT_WITH_CHECK,
    );
    expect(formatViolations(violations)).toBe(
      "Every UPDATE/ALL policy has an explicit WITH CHECK or a reviewed exemption.",
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
