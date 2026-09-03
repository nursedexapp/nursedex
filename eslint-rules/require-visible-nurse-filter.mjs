/**
 * Require the visible-nurse filter on service-role reads of nurse_profiles.
 *
 * `applyVisibleNurseFilter` (src/lib/nurses/visibility.ts) is the one place the
 * four "publicly visible nurse" conditions live: verified, not hidden, owner
 * not deleted, owner not suspended. The RLS policy enforces the same four, but
 * the service-role client bypasses RLS, so on those queries the filter is the
 * only thing standing between a hidden or suspended profile and a public page.
 * Applying it was convention alone: a new public read surface could forget and
 * leak, which is what its own docstring warns about (#621).
 *
 * Scope: a read (`.select`) on `nurse_profiles`, off a client that came
 * straight from `createServiceRoleClient()`. The three deliberate exceptions
 * (the admin verification queue, the admin count, the SLA cron's pending queue)
 * carry an eslint-disable-next-line with the reason at the query.
 *
 * Deliberately NOT flagged, because each would be a false positive that
 * pressures someone into silencing the rule on correct code:
 *   - reads on the RLS-scoped client from `createClient()`, where the database
 *     already enforces the same four conditions
 *   - writes (`.update`, `.insert`, `.upsert`, `.delete`), which cannot leak a
 *     profile to a reader
 *   - reads of any other table
 *
 * Known limit, kept on purpose: taint is not transitive. Only a client assigned
 * directly from `createServiceRoleClient()` is tracked, so a helper that
 * receives a client as a parameter (src/lib/profile/slug.ts) is not checked.
 * Following an injected client across call boundaries would need type
 * information this rule does not have, and guessing would flag every helper
 * that takes a `SupabaseClient`. The public read surfaces all build their own
 * client, which is the case worth guarding.
 */

const TABLE = "nurse_profiles";
// Either filter satisfies the rule: applyListedNurseFilter applies all four
// conditions and then adds the minimum-content one (#732), so a read routed
// through it is strictly narrower than one routed through the base filter.
const FILTERS = new Set([
  "applyVisibleNurseFilter",
  "applyListedNurseFilter",
  "applyUnlistedNurseFilter",
]);
const SERVICE_ROLE_FACTORY = "createServiceRoleClient";

/** Methods that make a chain a write, not a public read. */
const WRITE_METHODS = new Set(["update", "insert", "upsert", "delete"]);

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (node?.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/** `createServiceRoleClient()`, however it was imported. */
function isServiceRoleCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === SERVICE_ROLE_FACTORY
  );
}

/** Climb the scope chain for a variable by name. */
function resolveVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const found = s.variables.find((v) => v.name === name);
    if (found) return found;
  }
  return null;
}

/**
 * A variable holding a service-role client. Only a direct
 * `= createServiceRoleClient()` counts; see the "known limit" note above.
 */
function isServiceRoleVariable(variable) {
  return (variable?.defs ?? []).some(
    (def) => def.type === "Variable" && isServiceRoleCall(def.node.init),
  );
}

/** `<serviceRoleClient>.from("nurse_profiles")`. */
function isServiceRoleTableCall(node, sourceCode) {
  if (node.type !== "CallExpression") return false;
  if (propertyName(node.callee) !== "from") return false;

  const [table] = node.arguments;
  if (table?.type !== "Literal" || table.value !== TABLE) return false;

  const client = node.callee.object;
  if (client?.type !== "Identifier") return false;
  const scope = sourceCode.getScope(client);
  return isServiceRoleVariable(resolveVariable(scope, client.name));
}

/**
 * The outermost expression of the fluent chain this `.from()` call starts, so
 * `supabase.from(t).select(s).eq(a, b)` resolves to the whole `.eq(...)` call.
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

/** Every method called in the chain, from the outermost call inward. */
function chainMethods(outermost) {
  const names = [];
  let current = outermost;
  while (current) {
    if (current.type === "CallExpression") {
      const name = propertyName(current.callee);
      if (name) names.push(name);
      current = current.callee;
      continue;
    }
    if (current.type === "MemberExpression") {
      current = current.object;
      continue;
    }
    return names;
  }
  return names;
}

/** `applyVisibleNurseFilter(...)` or `applyListedNurseFilter(...)`. */
function isFilterCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    FILTERS.has(node.callee.name)
  );
}

/** The chain is passed straight into the filter: `await filter(query.eq(...))`. */
function isFilteredInline(outermost) {
  const parent = outermost.parent;
  return isFilterCall(parent) && parent.arguments.includes(outermost);
}

/** The name this chain was bound to, if it was stored in a variable. */
function boundName(outermost) {
  const parent = outermost.parent;
  if (parent?.type === "VariableDeclarator" && parent.init === outermost) {
    return parent.id?.type === "Identifier" ? parent.id.name : null;
  }
  if (parent?.type === "AssignmentExpression" && parent.right === outermost) {
    return parent.left?.type === "Identifier" ? parent.left.name : null;
  }
  return null;
}

/**
 * The variable holding this chain is handed to the filter somewhere, covering
 * both `await filter(query)` and `query = filter(query)`.
 */
function isFilteredViaVariable(outermost, sourceCode) {
  const name = boundName(outermost);
  if (!name) return false;

  const variable = resolveVariable(sourceCode.getScope(outermost), name);
  return (variable?.references ?? []).some((ref) => {
    const parent = ref.identifier.parent;
    return isFilterCall(parent) && parent.arguments.includes(ref.identifier);
  });
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require applyVisibleNurseFilter on service-role reads of nurse_profiles",
    },
    schema: [],
    messages: {
      missingVisibleNurseFilter:
        "This service-role read of nurse_profiles bypasses RLS, so it can expose unverified, hidden, deleted, or suspended nurses. Route it through applyVisibleNurseFilter from @/lib/nurses/visibility. If this read is meant to see non-public profiles (an admin surface or the verification queue), add an eslint-disable-next-line for this rule with the reason.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isServiceRoleTableCall(node, sourceCode)) return;

        const outermost = chainOutermost(node);
        const methods = chainMethods(outermost);

        if (!methods.includes("select")) return;
        if (methods.some((m) => WRITE_METHODS.has(m))) return;

        if (isFilteredInline(outermost)) return;
        if (isFilteredViaVariable(outermost, sourceCode)) return;

        context.report({
          node: outermost,
          messageId: "missingVisibleNurseFilter",
        });
      },
    };
  },
};
