// @vitest-environment node
//
// Wiring test for the atomic subscription event-ordering guard (issue #528).
//
// The ordering guarantee lives in Postgres: the INSERT ... ON CONFLICT is a
// single statement, so two events for the same subscription delivered at the
// same instant serialize on the stripe_subscription_id unique index instead
// of both passing a JS "am I newer" check. CI has no database, so these tests
// assert the SQL keeps the shape that provides the guarantee, and that the
// route never reintroduces the read-then-compare it replaced.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/055_apply_subscription_event.sql"),
  "utf8",
);

const ROUTE = readFileSync(
  join(process.cwd(), "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);

describe("055_apply_subscription_event.sql", () => {
  it("upserts on the stripe_subscription_id unique index that serializes concurrent events", () => {
    expect(MIGRATION).toMatch(
      /ON CONFLICT\s*\(\s*stripe_subscription_id\s*\)\s*DO UPDATE/i,
    );
  });

  it("applies the write only when the stored event is not newer than the incoming one", () => {
    expect(MIGRATION).toMatch(
      /WHERE\s+(?:public\.)?subscriptions\.last_event_at\s+IS NULL/i,
    );
    expect(MIGRATION).toMatch(
      /(?:public\.)?subscriptions\.last_event_at\s*<=\s*EXCLUDED\.last_event_at/i,
    );
  });

  it("uses <= so two events stamped in the same second both apply, matching prior behaviour", () => {
    // Stripe's `created` is unix seconds and is not unique across distinct
    // events. A strict `<` would silently drop a legitimate same-second
    // event, so a tie must still apply.
    expect(MIGRATION).not.toMatch(
      /(?:public\.)?subscriptions\.last_event_at\s*<\s*EXCLUDED\.last_event_at/i,
    );
  });

  it("returns whether the write applied rather than raising on a superseded event", () => {
    expect(MIGRATION).toMatch(/RETURNS boolean/i);
    expect(MIGRATION).toMatch(/COALESCE\(\s*v_applied\s*,\s*false\s*\)/i);
  });

  it("pins a stable search_path on the SECURITY DEFINER function", () => {
    expect(MIGRATION).toMatch(/SECURITY DEFINER/i);
    expect(MIGRATION).toMatch(/SET search_path\s*=\s*public/i);
  });

  it("revokes the default PUBLIC execute grant and grants only service_role", () => {
    expect(MIGRATION).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.apply_subscription_event\([^)]*\) FROM PUBLIC/i,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.apply_subscription_event\([^)]*\) TO service_role/i,
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.apply_subscription_event\([^)]*\) TO (anon|authenticated)/i,
    );
  });
});

describe("webhook route delegates ordering to the database", () => {
  it("calls the atomic apply_subscription_event RPC", () => {
    expect(ROUTE).toMatch(/apply_subscription_event/);
  });

  it("no longer upserts the subscriptions table directly", () => {
    expect(ROUTE).not.toMatch(/from\(\s*["']subscriptions["']\s*\)\s*\.upsert/);
  });

  it("no longer compares an incoming event against a stored last_event_at in JS", () => {
    // toUnixSeconds existed only to run that comparison in JavaScript.
    expect(ROUTE).not.toMatch(/eventCreated\s*<\s*toUnixSeconds/);
  });
});
