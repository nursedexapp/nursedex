import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./require-status-precondition.mjs";

const linter = new Linter();

/** Lint a snippet with only our rule enabled, returning its messages. */
function lint(code) {
  return linter.verify(
    code,
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
      plugins: { local: { rules: { "require-status-precondition": rule } } },
      rules: { "local/require-status-precondition": "error" },
    },
    "actions.ts",
  );
}

function expectRejected(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/require-status-precondition");
  expect(messages[0].message).toMatch(/guardedStatusUpdate/);
}

function expectClean(code) {
  expect(lint(code)).toEqual([]);
}

describe("require-status-precondition", () => {
  // The exact shape of #652: read the row, compare in JS, write by id alone.
  it("rejects a status UPDATE guarded only by an id", () => {
    expectRejected(`
      const { data: row } = await supabase.from("reviews")
        .select("status").eq("id", id).maybeSingle();
      if (row.status !== "disputed") return;
      await supabase.from("reviews")
        .update({ status: "approved" })
        .eq("id", id);
    `);
  });

  it("rejects it even when the chain ends in .select()", () => {
    // .select() hands back the rows, but without a status precondition BOTH
    // callers get their row back, so it proves nothing.
    expectRejected(`
      await supabase.from("hires")
        .update({ status: "confirmed", confirmed_at: now })
        .eq("id", id)
        .select("id");
    `);
  });

  it("rejects a quoted status key too", () => {
    expectRejected(`
      await supabase.from("reviews").update({ "status": "approved" }).eq("id", id);
    `);
  });

  it("accepts a status UPDATE that constrains status with .eq", () => {
    expectClean(`
      await supabase.from("reviews")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
    `);
  });

  it("accepts .in, for a transition legal from more than one status", () => {
    expectClean(`
      await supabase.from("consulting_requests")
        .update({ status: "done" })
        .eq("id", id)
        .in("status", ["approved", "in_progress"]);
    `);
  });

  it("accepts .neq, which is how a repeat of the same transition is refused", () => {
    expectClean(`
      await supabase.from("blog_comments")
        .update({ status })
        .eq("id", id)
        .neq("status", status)
        .select("post_id");
    `);
  });

  it("accepts .not, the negated form", () => {
    expectClean(`
      await supabase.from("consulting_requests")
        .update({ status: "done" })
        .eq("id", id)
        .not("status", "in", "(done,invoiced)");
    `);
  });

  it("ignores guardedStatusUpdate, which is the preferred spelling", () => {
    // It is not a .update() call, so it must never be flagged: the helper puts
    // the precondition in the WHERE clause by construction.
    expectClean(`
      await guardedStatusUpdate(supabase, {
        table: "reviews",
        id,
        expectedStatus: "disputed",
        patch: { status: "approved" },
      });
    `);
  });

  it("ignores an UPDATE that does not write status", () => {
    expectClean(`
      await supabase.from("nurse_profiles")
        .update({ bio: "hello", rate_min: 40 })
        .eq("user_id", userId);
    `);
  });

  it("ignores a patch it cannot see into, rather than guessing", () => {
    // A dynamic patch could contain anything. Flagging on a guess would hit every
    // helper that builds its patch, and teach people to silence the rule.
    expectClean(`
      await supabase.from("reviews").update(patch).eq("id", id);
    `);
  });
});
