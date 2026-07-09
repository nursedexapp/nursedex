// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { guardedStatusUpdate } from "./guarded-status-update";

type Resolved = { data: unknown[] | null; error: { message: string } | null };

/**
 * Builds a client whose terminal .select() resolves to `result`, recording
 * every .eq() filter so a test can prove the status guard was actually
 * applied to the UPDATE rather than checked beforehand.
 */
function clientFor(result: Resolved) {
  const eqCalls: unknown[][] = [];
  const updates: unknown[] = [];
  const tables: string[] = [];

  const client = {
    from: (table: string) => {
      tables.push(table);
      return createQueryBuilder({
        update: (patch: unknown) => {
          updates.push(patch);
          return "chain";
        },
        eq: (...args: unknown[]) => {
          eqCalls.push(args);
          return "chain";
        },
        select: () => result,
      });
    },
  } as unknown as SupabaseClient;

  return { client, eqCalls, updates, tables };
}

describe("guardedStatusUpdate", () => {
  it("reports updated when the guarded UPDATE affects a row", async () => {
    const { client } = clientFor({ data: [{ id: 7 }], error: null });
    const res = await guardedStatusUpdate(client, {
      table: "consulting_requests",
      id: 7,
      expectedStatus: "triaged",
      patch: { status: "approved" },
    });
    expect(res).toEqual({ outcome: "updated" });
  });

  it("filters the UPDATE on both id and the expected status", async () => {
    const { client, eqCalls, updates, tables } = clientFor({
      data: [{ id: 7 }],
      error: null,
    });
    await guardedStatusUpdate(client, {
      table: "consulting_requests",
      id: 7,
      expectedStatus: "triaged",
      patch: { status: "approved" },
    });
    // The status filter on the UPDATE itself is the whole point: a prior
    // SELECT check is a stale read and cannot serialize concurrent callers.
    expect(tables).toEqual(["consulting_requests"]);
    expect(updates).toEqual([{ status: "approved" }]);
    expect(eqCalls).toEqual([
      ["id", 7],
      ["status", "triaged"],
    ]);
  });

  it("reports already_resolved when no row matched the expected status", async () => {
    const { client } = clientFor({ data: [], error: null });
    const res = await guardedStatusUpdate(client, {
      table: "consulting_requests",
      id: 7,
      expectedStatus: "triaged",
      patch: { status: "approved" },
    });
    expect(res).toEqual({ outcome: "already_resolved" });
  });

  it("treats a null data set as already_resolved rather than updated", async () => {
    const { client } = clientFor({ data: null, error: null });
    const res = await guardedStatusUpdate(client, {
      table: "hires",
      id: "h1",
      expectedStatus: "claimed",
      patch: { status: "confirmed" },
    });
    expect(res).toEqual({ outcome: "already_resolved" });
  });

  it("surfaces a database error instead of reporting success", async () => {
    const { client } = clientFor({ data: null, error: { message: "boom" } });
    const res = await guardedStatusUpdate(client, {
      table: "hires",
      id: "h1",
      expectedStatus: "claimed",
      patch: { status: "confirmed" },
    });
    expect(res).toEqual({ outcome: "error", message: "boom" });
  });

  it("never reports updated when an error accompanies returned rows", async () => {
    // Defensive: an error must win over any rows the driver hands back, so a
    // caller can never fire a side effect on a failed write.
    const { client } = clientFor({
      data: [{ id: 7 }],
      error: { message: "conflict" },
    });
    const res = await guardedStatusUpdate(client, {
      table: "hires",
      id: "h1",
      expectedStatus: "claimed",
      patch: { status: "confirmed" },
    });
    expect(res).toEqual({ outcome: "error", message: "conflict" });
  });

  it("honours custom id and status column names", async () => {
    const { client, eqCalls } = clientFor({ data: [{ id: 1 }], error: null });
    await guardedStatusUpdate(client, {
      table: "widgets",
      id: 1,
      expectedStatus: "pending",
      patch: { state: "done" },
      idColumn: "widget_id",
      statusColumn: "state",
    });
    expect(eqCalls).toEqual([
      ["widget_id", 1],
      ["state", "pending"],
    ]);
  });
});
