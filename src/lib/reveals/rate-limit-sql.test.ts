// @vitest-environment node
//
// Wiring test for the atomic reveal rate-limit consume (issue #563).
//
// The real concurrency guarantee lives in Postgres: concurrent
// INSERT ... ON CONFLICT statements serialize on the (family_user_id, date)
// unique index, so the increment cannot lose an update and the WHERE guard
// cannot let a family past the hard cap. CI has no database, so these tests
// assert the SQL keeps the shape that provides that guarantee, and that the
// action never reintroduces the read-modify-write it replaced.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/054_consume_reveal_rate_limit.sql",
  ),
  "utf8",
);

const ACTION = readFileSync(
  join(process.cwd(), "src/lib/reveals/actions.ts"),
  "utf8",
);

describe("054_consume_reveal_rate_limit.sql", () => {
  it("increments inside SQL rather than writing back a value computed elsewhere", () => {
    expect(MIGRATION).toMatch(
      /reveal_count\s*=\s*(?:public\.)?rate_limit_reveals\.reveal_count\s*\+\s*1/,
    );
  });

  it("upserts on the (family_user_id, date) unique index that serializes concurrent bumps", () => {
    expect(MIGRATION).toMatch(
      /ON CONFLICT\s*\(\s*family_user_id\s*,\s*date\s*\)\s*DO UPDATE/i,
    );
  });

  it("guards the increment with the hard cap so a concurrent burst cannot exceed it", () => {
    expect(MIGRATION).toMatch(
      /WHERE\s+(?:public\.)?rate_limit_reveals\.reveal_count\s*<\s*v_hard_cap/i,
    );
  });

  it("pins a stable search_path on the SECURITY DEFINER function", () => {
    expect(MIGRATION).toMatch(/SECURITY DEFINER/i);
    expect(MIGRATION).toMatch(/SET search_path\s*=\s*public/i);
  });

  it("revokes the default PUBLIC execute grant", () => {
    expect(MIGRATION).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.consume_reveal_rate_limit\(uuid, boolean\) FROM PUBLIC/i,
    );
  });

  it("grants execute only to service_role, never to anon or authenticated", () => {
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_reveal_rate_limit\(uuid, boolean\) TO service_role/i,
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_reveal_rate_limit\(uuid, boolean\) TO (anon|authenticated)/i,
    );
  });
});

describe("reveals action no longer read-modify-writes the counter", () => {
  it("never selects or updates rate_limit_reveals directly", () => {
    expect(ACTION).not.toMatch(/from\(\s*["']rate_limit_reveals["']\s*\)/);
  });

  it("calls the atomic consume RPC", () => {
    expect(ACTION).toMatch(/consume_reveal_rate_limit/);
  });
});
