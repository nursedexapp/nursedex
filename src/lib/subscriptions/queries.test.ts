// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// The access gate lives in the query itself: getActiveSubscription only
// selects rows whose status is IN ("active", "past_due"). Rather than assert
// on builder arguments, this mock seeds a fake "subscriptions" table and
// applies the same user_id / plan_type / status filtering the DB would, so a
// cancelled or expired row genuinely fails to come back. If the gate were
// ever widened (e.g. to include "cancelled"), these tests fail.
type Row = {
  id: string;
  user_id: string;
  plan_type: "nurse_featured" | "family_access";
  status: "active" | "past_due" | "cancelled" | "expired";
  created_at: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_customer_id: string;
  stripe_subscription_id: string;
};

const h = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const constraints: {
        eq: Record<string, unknown>;
        in: Record<string, unknown[]>;
      } = { eq: {}, in: {} };
      return createQueryBuilder({
        eq: (col, val) => {
          constraints.eq[col as string] = val;
          return "chain";
        },
        in: (col, vals) => {
          constraints.in[col as string] = vals as unknown[];
          return "chain";
        },
        maybeSingle: () => {
          const matches = h.rows
            .filter((r) =>
              Object.entries(constraints.eq).every(
                (entry) => (r as Record<string, unknown>)[entry[0]] === entry[1],
              ),
            )
            .filter((r) =>
              Object.entries(constraints.in).every((entry) =>
                entry[1].includes((r as Record<string, unknown>)[entry[0]]),
              ),
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { data: matches[0] ?? null };
        },
      });
    },
  }),
}));

import { getActiveSubscription, hasActiveFamilyAccess } from "./queries";

function seedRow(overrides: Partial<Row>): Row {
  return {
    id: "sub_1",
    user_id: "u1",
    plan_type: "family_access",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    current_period_end: "2026-02-01T00:00:00Z",
    cancel_at_period_end: false,
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "stripe_sub_1",
    ...overrides,
  };
}

beforeEach(() => {
  h.rows = [];
});

describe("hasActiveFamilyAccess", () => {
  it("returns true for an active family_access subscription", async () => {
    h.rows = [seedRow({ status: "active" })];
    expect(await hasActiveFamilyAccess("u1")).toBe(true);
  });

  it("returns true for a past_due subscription (grace period)", async () => {
    h.rows = [seedRow({ status: "past_due" })];
    expect(await hasActiveFamilyAccess("u1")).toBe(true);
  });

  it("returns false for a cancelled subscription", async () => {
    h.rows = [seedRow({ status: "cancelled" })];
    expect(await hasActiveFamilyAccess("u1")).toBe(false);
  });

  it("returns false for an expired subscription", async () => {
    h.rows = [seedRow({ status: "expired" })];
    expect(await hasActiveFamilyAccess("u1")).toBe(false);
  });

  it("returns false when the user has no subscription", async () => {
    h.rows = [];
    expect(await hasActiveFamilyAccess("u1")).toBe(false);
  });

  it("returns false when only another user holds an active subscription", async () => {
    h.rows = [seedRow({ user_id: "someone_else", status: "active" })];
    expect(await hasActiveFamilyAccess("u1")).toBe(false);
  });
});

describe("getActiveSubscription", () => {
  it("returns the row for an active subscription of the requested plan", async () => {
    h.rows = [seedRow({ id: "sub_active", status: "active" })];
    const sub = await getActiveSubscription("u1", "family_access");
    expect(sub?.id).toBe("sub_active");
    expect(sub?.status).toBe("active");
  });

  it("does not return a subscription for a different plan type", async () => {
    h.rows = [seedRow({ plan_type: "nurse_featured", status: "active" })];
    expect(await getActiveSubscription("u1", "family_access")).toBeNull();
  });

  it("returns null when the only matching sub is cancelled", async () => {
    h.rows = [seedRow({ status: "cancelled" })];
    expect(await getActiveSubscription("u1", "family_access")).toBeNull();
  });

  it("prefers the most recently created active row", async () => {
    h.rows = [
      seedRow({
        id: "old",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      }),
      seedRow({
        id: "new",
        status: "active",
        created_at: "2026-06-01T00:00:00Z",
      }),
    ];
    const sub = await getActiveSubscription("u1", "family_access");
    expect(sub?.id).toBe("new");
  });
});
