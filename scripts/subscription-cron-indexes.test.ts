// @vitest-environment node
//
// The indexes for the subscription crons, held against the queries they were
// written for (#439).
//
// A partial index is only useful while its WHERE clause matches the predicate
// the query actually uses. Change the cron's filter and the index quietly stops
// being reachable: nothing fails, nothing is logged, the query simply goes back
// to reading the whole table and the index goes on costing writes forever.
//
// So each index is checked against the route it exists for. If one side moves,
// this says which, rather than leaving a dead index in the schema (L41, L29).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/067_subscription_cron_indexes.sql"),
  "utf8",
);

/** Only executed SQL can create an index; the comments explain it. */
const SQL = MIGRATION.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

function route(name: string): string {
  return readFileSync(
    join(process.cwd(), "src/app/api/cron", name, "route.ts"),
    "utf8",
  );
}

describe("the subscription cron indexes", () => {
  it("creates an index for each of the three daily crons", () => {
    const created = SQL.match(/CREATE INDEX/g) ?? [];
    expect(created).toHaveLength(3);
  });

  it("matches payment-failure, which asks for past_due subscriptions", () => {
    expect(route("payment-failure")).toContain('.eq("status", "past_due")');
    expect(SQL).toMatch(/ON public\.subscriptions \(status\)/);
    expect(SQL).toMatch(/WHERE status = 'past_due'/);
  });

  it("matches renewal-reminder, which asks for an active period ending soon", () => {
    const source = route("renewal-reminder");
    expect(source).toContain('.eq("status", "active")');
    expect(source).toContain('.eq("cancel_at_period_end", false)');
    expect(source).toContain('.gte("current_period_end"');

    expect(SQL).toMatch(/ON public\.subscriptions \(current_period_end\)/);
    expect(SQL).toMatch(
      /WHERE status = 'active' AND cancel_at_period_end = false/,
    );
  });

  it("matches access-expiry, which asks for family access ending soon", () => {
    const source = route("access-expiry");
    expect(source).toContain('.eq("plan_type", "family_access")');
    expect(source).toContain('.gte("access_expires_at"');

    expect(SQL).toMatch(/ON public\.subscriptions \(access_expires_at\)/);
    expect(SQL).toMatch(/WHERE plan_type = 'family_access'/);
  });

  /**
   * Re-running a migration is normal here (a fresh CI database applies every
   * one of them), and a bare CREATE INDEX would fail the second time.
   */
  it("can be applied twice without failing", () => {
    const created = SQL.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(created).toHaveLength(3);
  });
});
