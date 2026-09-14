import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  calculateCompleteness,
  COMPLETENESS_FIELDS,
  type CompletenessInput,
} from "@/lib/profile/completeness";

/**
 * A new nurse profile must be created carrying the score it already earns.
 *
 * The rule credits every nurse points before she fills anything in, but the
 * row used to be inserted with no score, so the column default of 0 stood
 * until she finished onboarding. Every nurse who stopped before then was
 * drift by construction, and the weekly data drift check (#927) alerted on
 * each of them for ever (seen 2026-09-14).
 *
 * The expected score is computed from the column defaults as the MIGRATION
 * declares them, not from a copy of them, so a default that changes in the
 * schema fails here rather than quietly re-creating the drift.
 */

const { inserts } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    delete: () => {},
    set: () => {},
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { first_name: "Ada", last_name: "Lovelace" },
            error: null,
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  })),
}));

import { selectRole } from "@/lib/auth/actions";

/** What a freshly inserted row holds in each scored column, per 001_schema.sql. */
function scoredDefaultsFromMigration(): CompletenessInput {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/001_schema.sql"),
    "utf8",
  );
  const table = sql.slice(sql.indexOf("CREATE TABLE public.nurse_profiles"));
  const body = table.slice(0, table.indexOf(");"));
  const out: Record<string, unknown> = {};
  for (const column of COMPLETENESS_FIELDS) {
    const line = body.match(new RegExp(`^\\s*${column}\\s+(.*)$`, "m"));
    if (!line) throw new Error(`${column} is not declared in nurse_profiles`);
    const def = line[1].match(/DEFAULT\s+('[^']*'|\w+)/)?.[1];
    if (def === undefined) out[column] = null;
    else if (def === "'{}'") out[column] = [];
    else if (def === "true" || def === "false") out[column] = def === "true";
    else throw new Error(`${column} has a default this test cannot read: ${def}`);
  }
  return out as CompletenessInput;
}

describe("selectRole(nurse)", () => {
  it("creates the profile with the score its defaults earn", async () => {
    const earned = calculateCompleteness(scoredDefaultsFromMigration()).score;
    // The premise: if an empty profile earned 0, the column default would
    // already be right and this test could not tell the fix from its absence.
    expect(earned).toBeGreaterThan(0);

    const fd = new FormData();
    fd.set("role", "nurse");
    await expect(selectRole(fd)).rejects.toThrow("NEXT_REDIRECT");

    const created = inserts.filter((i) => i.table === "nurse_profiles");
    expect(created).toHaveLength(1);
    expect(created[0].row.profile_completeness).toBe(earned);
  });
});
