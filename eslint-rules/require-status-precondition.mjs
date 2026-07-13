/**
 * Require a status transition to carry its precondition in the WHERE clause.
 *
 * The shape this bans:
 *
 *     const { data: row } = await supabase.from("reviews").select("status")...
 *     if (row.status !== "disputed") return;          // decided in JavaScript
 *     await supabase.from("reviews")
 *       .update({ status: "approved" })               // ...written by id alone
 *       .eq("id", id);
 *
 * Two callers both read `disputed`, both pass the check, both write, and both go
 * on to fire whatever the transition guards: an email to a real person, a burned
 * reveal slot, a duplicate hire row, a second billable time entry. The gap
 * between the SELECT and the UPDATE is the bug, and no amount of care in the
 * JavaScript closes it.
 *
 * The fix is to put the expected status into the UPDATE's own WHERE clause, so
 * Postgres arbitrates: exactly one caller matches a row and the loser gets zero
 * rows back. `guardedStatusUpdate` (src/lib/db/guarded-status-update.ts) does
 * this, and is the preferred spelling.
 *
 * This is the fourth time the same defect shipped (#419, #562, then #651/#652/
 * #653 together), and each time it was found by accident rather than by looking.
 * #663 swept the codebase; this rule is what stops the pattern regrowing.
 *
 * Scope: an `.update()` whose patch object literally sets `status`, on a fluent
 * Supabase chain. It passes when the same chain constrains `status` with any of
 * .eq / .in / .neq / .is / .not, which are the five ways a precondition can be
 * expressed against that column.
 *
 * Deliberately NOT flagged, because each would be a false positive that pressures
 * someone into silencing the rule on correct code:
 *   - `guardedStatusUpdate(...)`, which is not a `.update()` call at all and
 *     already puts the precondition in the WHERE clause by construction
 *   - an `.update()` that does not write `status` (a profile edit, a counter)
 *   - an `.update()` whose patch is a variable rather than an object literal, so
 *     the rule cannot see whether `status` is in it. Flagging on a guess would
 *     hit every dynamic patch in the codebase.
 *   - RPCs, which do the claim and the write in one statement inside the database
 *
 * Known limit, kept on purpose: this sees the `status` column only. A transition
 * gated on some other flag (`is_deleted`, `confirmed_at`) is the same bug, and
 * the fixes in #663 put those preconditions in the WHERE clause too, but naming
 * every state-ish column here would flag ordinary field writes and train people
 * to add eslint-disable lines. `status` is the column the pattern actually keeps
 * regrowing on.
 */

const STATUS_COLUMN = "status";

/** The ways a chain can constrain a column in its WHERE clause. */
const GUARD_METHODS = new Set(["eq", "in", "neq", "is", "not"]);

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (node?.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/** `.update({ status: "approved", ... })`: an object literal that sets status. */
function updatesStatus(node) {
  const [patch] = node.arguments;
  if (patch?.type !== "ObjectExpression") return false;
  return patch.properties.some(
    (p) =>
      p.type === "Property" &&
      !p.computed &&
      ((p.key?.type === "Identifier" && p.key.name === STATUS_COLUMN) ||
        (p.key?.type === "Literal" && p.key.value === STATUS_COLUMN)),
  );
}

/**
 * The outermost expression of the fluent chain this call belongs to, so
 * `supabase.from(t).update(p).eq(a, b).select()` resolves to the whole thing
 * however deep the reported `.update()` sits.
 */
function chainOutermost(node) {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (parent?.type === "MemberExpression" && parent.object === current) {
      current = parent;
      continue;
    }
    if (parent?.type === "CallExpression" && parent.callee === current) {
      current = parent;
      continue;
    }
    return current;
  }
}

/** Every CallExpression in the chain, from the outermost call inward. */
function chainCalls(outermost) {
  const calls = [];
  let current = outermost;
  while (current) {
    if (current.type === "CallExpression") {
      calls.push(current);
      current = current.callee;
      continue;
    }
    if (current.type === "MemberExpression") {
      current = current.object;
      continue;
    }
    return calls;
  }
  return calls;
}

/** Does any link in the chain constrain the `status` column? */
function constrainsStatus(outermost) {
  return chainCalls(outermost).some((call) => {
    const name = propertyName(call.callee);
    if (!name || !GUARD_METHODS.has(name)) return false;
    const [column] = call.arguments;
    return column?.type === "Literal" && column.value === STATUS_COLUMN;
  });
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a status-transition UPDATE to carry its expected status in the WHERE clause",
    },
    schema: [],
    messages: {
      unguarded:
        "This UPDATE writes `status` without constraining `status` in its WHERE clause, so a concurrent caller can apply the same transition twice and fire its side effect twice (#663). Use guardedStatusUpdate() from src/lib/db/guarded-status-update.ts, or add the expected status to the query (e.g. .eq(\"status\", \"pending\")).",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (propertyName(node.callee) !== "update") return;
        if (!updatesStatus(node)) return;
        if (constrainsStatus(chainOutermost(node))) return;

        context.report({ node, messageId: "unguarded" });
      },
    };
  },
};
