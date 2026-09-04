/**
 * Refuse a fire-and-forget async IIFE whose rejection nobody catches.
 *
 * `void (async () => { ... await action() ... })()` is how three controls in
 * this repo tracked their own in-flight state, and it is the #846 defect: the
 * pending flag is set before the IIFE, the reset lives after the await, and a
 * rejection skips every line between. The button spins forever with no message,
 * on work that may already have landed. HireButton was still carrying it live
 * when #987 was written, and `local/require-pending-button` passed the file,
 * which is the evidence that checking callers by hand is not a plan.
 *
 * The remedy is useInFlight (src/components/ui/use-in-flight.ts), which owns the
 * flag, the gate, the retry door and the catch in one place.
 *
 * Flagged: an async IIFE, with or without `void`, invoked and discarded in
 * statement position, whose body is not wholly wrapped in a try with a catch.
 *
 * An await is not required. An async function rejects on a plain throw too, and
 * requiring one would have made the `async` test above unfalsifiable: a
 * non-async function cannot contain an await, so the two conditions could never
 * disagree, and a condition nothing can tell apart from its neighbour is not a
 * condition.
 *
 * NOT flagged, because the rejection has somewhere to go in each case:
 *   - a body that is one try/catch, which is what RevealCTA had
 *   - a `.catch()` chained onto the call
 *   - an IIFE that is awaited or returned, so its caller owns the rejection
 *
 * This ships over a tree with no instances left, which is the case a guard
 * cannot be told apart from one that matches nothing, so its fixtures do the
 * proving and eslint-rules/lint-config-coverage.test.mjs proves it is wired in.
 */

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (node?.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/** An async arrow or function expression called immediately. */
function asyncIifeCallee(node) {
  const callee = node.callee;
  if (
    callee?.type !== "ArrowFunctionExpression" &&
    callee?.type !== "FunctionExpression"
  ) {
    return null;
  }
  return callee.async ? callee : null;
}

/**
 * A body that is exactly one try with a catch.
 *
 * The length test is the load-bearing half. A body whose FIRST statement is a
 * guarded try, with an unguarded await after it, is the shape where the catch
 * reads as covering the function and covers only its opening; that trailing
 * await is precisely the one that leaves the control stuck.
 */
function isWhollyGuarded(fn) {
  const body = fn.body;
  if (body?.type !== "BlockStatement") return false;
  if (body.body.length !== 1) return false;
  const only = body.body[0];
  return only.type === "TryStatement" && only.handler !== null;
}

/** Climb past `void`, `await` and parentheses to whatever consumes the call. */
function consumerOf(node) {
  let current = node;
  let parent = current.parent;
  while (
    parent &&
    ((parent.type === "UnaryExpression" && parent.operator === "void") ||
      parent.type === "TSNonNullExpression")
  ) {
    current = parent;
    parent = current.parent;
  }
  return { node: current, parent };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "refuse a fire-and-forget async IIFE whose rejection nobody catches",
    },
    schema: [],
    messages: {
      uncaught:
        "This async IIFE is discarded, so a rejection inside it skips every line after the await: the pending flag is never cleared and the control spins forever with nothing said (#846, #987). Use useInFlight from @/components/ui/use-in-flight, which owns the flag, the gate, the retry door and the catch, or wrap the whole body in one try/catch.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const fn = asyncIifeCallee(node);
        if (!fn) return;
        if (isWhollyGuarded(fn)) return;

        const { parent } = consumerOf(node);

        // `.catch(...)` or `.then(onOk, onError)` on the call handles it.
        if (parent?.type === "MemberExpression" && parent.object !== undefined) {
          const method = propertyName(parent);
          if (method === "catch" || method === "then") return;
        }

        // Awaited, returned, or handed to somebody: the rejection is theirs.
        if (
          parent?.type === "AwaitExpression" ||
          parent?.type === "ReturnStatement" ||
          parent?.type === "VariableDeclarator" ||
          parent?.type === "ArrowFunctionExpression" ||
          (parent?.type === "CallExpression" && parent.callee !== node)
        ) {
          return;
        }

        context.report({ node, messageId: "uncaught" });
      },
    };
  },
};
