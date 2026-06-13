// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  let rows: unknown[] = [];

  function from() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return b;
    };
    b.not = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.or = () => b;
    // The Supabase builder is thenable, so `await q` resolves the rows.
    b.then = (resolve: (v: { data: unknown[] }) => unknown) =>
      resolve({ data: rows });
    return b;
  }

  return {
    eqCalls,
    from,
    setRows: (r: unknown[]) => {
      rows = r;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: h.from }),
}));

import { getAccounts } from "./queries";

beforeEach(() => {
  h.eqCalls.length = 0;
  h.setRows([]);
});

const isDeletedFilter = () =>
  h.eqCalls.find((c) => c.column === "is_deleted")?.value;

describe("getAccounts deleted filter", () => {
  it("lists live accounts by default", async () => {
    await getAccounts({});
    expect(isDeletedFilter()).toBe(false);
  });

  it("lists soft-deleted accounts for the Removed view", async () => {
    await getAccounts({ deleted: true });
    expect(isDeletedFilter()).toBe(true);
  });

  it("keeps the role scope alongside the deleted flag", async () => {
    await getAccounts({ deleted: false, role: "nurse" });
    expect(isDeletedFilter()).toBe(false);
    expect(h.eqCalls).toContainEqual({ column: "role", value: "nurse" });
  });

  it("maps returned rows to AccountRow shape", async () => {
    h.setRows([
      {
        id: "u1",
        email: "removed@example.com",
        first_name: "Re",
        last_name: "Moved",
        role: "family",
        is_suspended: false,
        is_deleted: true,
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ]);
    const out = await getAccounts({ deleted: true });
    expect(out).toEqual([
      {
        user_id: "u1",
        email: "removed@example.com",
        first_name: "Re",
        last_name: "Moved",
        role: "family",
        is_suspended: false,
        is_deleted: true,
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ]);
  });
});
