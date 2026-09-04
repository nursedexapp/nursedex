/**
 * Require a Supabase result's `error` to be looked at.
 *
 * A PostgREST call does not throw. It resolves to `{ data, error }`, so
 * `const { data } = await supabase.from(...)` turns any failure to read into an
 * empty answer and treats it as the truth. Measured 4 September 2026 by an AST
 * walk, around 244 sites in this repo did that (#847). The harm is never a
 * blank screen: a family who had spent a reveal was told they had not, a paying
 * family was told they had no subscription (#845), and the admin dashboard
 * renders zero nurses and zero revenue during a database problem because
 * sixteen count queries each read `count ?? 0` (#991).
 *
 * WHY THIS IS NOT WRITTEN AGAINST THE CLIENT
 *
 * The obvious rule is "a query off a Supabase client must check its error", and
 * it cannot be written. `require-visible-nurse-filter` records why under "Known
 * limit, kept on purpose": taint is not transitive, so a helper that receives a
 * client as a parameter is untracked. That rule tolerates the limit because it
 * guards public read surfaces only, which all build their own client. This one
 * cannot: 37 of the sites live in src/lib, which is exactly where injected
 * clients are, and naming the client instead is a hand list with six spellings
 * already (L96, L217).
 *
 * So the client is never identified. What is matched is the SHAPE of a
 * PostgREST chain, which is the same whoever built the client: a `.from(...)`
 * with a query verb on it, or a `.rpc(...)`. What is required is that the
 * result reaches something that can see the error, which is either one of the
 * shared helpers in src/lib/db/results.ts or a hand written binding of `error`
 * that the code goes on to use.
 *
 * The helpers are accepted by NAME rather than by import, deliberately: a rule
 * that resolved the import would be back to following values across modules,
 * and these three names exist nowhere else in the repo.
 *
 * WHAT IS DELIBERATELY NOT FLAGGED, because a false positive here pressures
 * somebody into silencing the rule on correct code:
 *   - a result returned whole, or put into an array or object: the error
 *     travels with it and whoever unpacks it is the one that has to look
 *   - a query that is built here and awaited somewhere else
 *   - an await of anything that is not a PostgREST chain
 */

/** The shared helpers in src/lib/db/results.ts. Any of them satisfies the rule. */
const HELPERS = new Set([
  "assertNoWriteError",
  "unwrapOrThrow",
  "toTypedFailure",
  // The count pair. A `{ count: "exact" }` answer is not in `data`, so these
  // exist separately rather than as an option on the two above (#991).
  "toTypedCount",
  "unwrapCountOrThrow",
]);

/**
 * A chain has to carry a verb as well as a `.from(...)`, or `Array.from(x)` and
 * `Buffer.from(x)` would read as database reads.
 */
const VERBS = new Set([
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  // supabase.storage.from(bucket).<verb>
  "remove",
  "upload",
  "download",
  "createSignedUrl",
  "createSignedUrls",
  "move",
  "copy",
]);

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (node?.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/** Strip the wrappers that sit between an expression and its value. */
function unwrap(node) {
  let cur = node;
  while (
    cur &&
    (cur.type === "TSNonNullExpression" ||
      cur.type === "TSAsExpression" ||
      cur.type === "TSSatisfiesExpression")
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** Every method name called in a member chain, outermost first. */
function chainCallNames(node) {
  const names = [];
  let cur = unwrap(node);
  while (cur) {
    if (cur.type === "CallExpression") {
      const name = propertyName(cur.callee);
      if (name) names.push(name);
      cur = unwrap(cur.callee);
    } else if (cur.type === "MemberExpression") {
      cur = unwrap(cur.object);
    } else {
      break;
    }
  }
  return names;
}

/** A PostgREST query or write, whoever built the client it hangs off. */
function isPostgrestChain(node) {
  const inner = unwrap(node);
  if (inner?.type !== "CallExpression") return false;
  const names = chainCallNames(inner);
  if (names.includes("rpc")) return true;
  return names.includes("from") && names.some((n) => VERBS.has(n));
}

/** `helperName(...)`, however it was imported. */
function isHelperCall(node) {
  const inner = unwrap(node);
  return (
    inner?.type === "CallExpression" &&
    inner.callee?.type === "Identifier" &&
    HELPERS.has(inner.callee.name)
  );
}

/** `Promise.all([...])` or `Promise.allSettled([...])`, with a literal array. */
function promiseAllElements(node) {
  const inner = unwrap(node);
  if (inner?.type !== "CallExpression") return null;
  const callee = inner.callee;
  if (
    callee?.type !== "MemberExpression" ||
    callee.object?.type !== "Identifier" ||
    callee.object.name !== "Promise"
  ) {
    return null;
  }
  const method = propertyName(callee);
  if (method !== "all" && method !== "allSettled") return null;
  const [first] = inner.arguments;
  return unwrap(first)?.type === "ArrayExpression" ? unwrap(first).elements : null;
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
 * A variable that holds a query rather than a result: assigned a PostgREST
 * chain, or reassigned from one, which is how an optional filter gets added.
 */
function holdsQuery(variable) {
  const fromDef = (variable?.defs ?? []).some(
    (def) => def.type === "Variable" && isPostgrestChain(def.node.init),
  );
  if (fromDef) return true;
  return (variable?.references ?? []).some((ref) => {
    const write = ref.writeExpr;
    if (!write) return false;
    if (isPostgrestChain(write)) return true;
    // `q = q.eq(...)` keeps it a query.
    const names = chainCallNames(write);
    return names.length > 0 && holdsQueryIdentifier(write);
  });
}

/** The base of a chain is the variable itself, as in `q = q.eq("id", id)`. */
function holdsQueryIdentifier(node) {
  let cur = unwrap(node);
  while (cur) {
    if (cur.type === "CallExpression") cur = unwrap(cur.callee);
    else if (cur.type === "MemberExpression") cur = unwrap(cur.object);
    else break;
  }
  return cur?.type === "Identifier";
}

/** Does this object pattern bind `error`, or a rest that would capture it? */
function bindsError(pattern) {
  return pattern.properties.some((prop) => {
    if (prop.type === "RestElement") return true;
    if (prop.computed) return true;
    return prop.key?.type === "Identifier" && prop.key.name === "error";
  });
}

/**
 * A binding holding a result is satisfied when something reads its error: a
 * `.error` access, a destructure that binds error, or a hand-off to a helper.
 */
function bindingChecksError(scope, name) {
  const variable = resolveVariable(scope, name);
  if (!variable) return true; // cannot see it, so do not accuse (L119)
  return variable.references.some((ref) => {
    const id = ref.identifier;
    const parent = id.parent;
    if (!parent) return false;
    if (parent.type === "MemberExpression" && parent.object === id) {
      return propertyName(parent) === "error" || parent.computed;
    }
    if (parent.type === "VariableDeclarator" && parent.init === id) {
      return parent.id.type === "ObjectPattern" && bindsError(parent.id);
    }
    if (parent.type === "CallExpression" && parent.arguments.includes(id)) {
      // Passed to a helper, or passed on to somebody else who has to look.
      return true;
    }
    if (parent.type === "ReturnStatement") return true;
    return false;
  });
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a Supabase result's error to reach one of the shared db result helpers, or a binding that reads it",
    },
    schema: [],
    messages: {
      discarded:
        "This database result discards its `error`, so a failure to read comes back as an empty answer and is treated as the truth (#847). Route it through unwrapOrThrow (a server-only read behind a page render), toTypedFailure (a \"use server\" action behind a control) or assertNoWriteError (a write), from src/lib/db/results.ts.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function scopeAt(node) {
      return sourceCode.getScope
        ? sourceCode.getScope(node)
        : context.getScope();
    }

    /** Report unless the awaited result reaches something that reads its error. */
    function checkResultConsumer(awaitNode, scope) {
      const parent = awaitNode.parent;
      if (!parent) return;

      if (parent.type === "CallExpression" && isHelperCall(parent)) return;
      if (parent.type === "ReturnStatement") return;
      if (parent.type === "ArrowFunctionExpression") return;
      if (parent.type === "AwaitExpression") return;

      if (parent.type === "MemberExpression" && parent.object === awaitNode) {
        if (propertyName(parent) === "error" || parent.computed) return;
        context.report({ node: awaitNode, messageId: "discarded" });
        return;
      }

      if (parent.type === "VariableDeclarator" && parent.init === awaitNode) {
        const id = parent.id;
        if (id.type === "ObjectPattern") {
          if (!bindsError(id)) {
            context.report({ node: awaitNode, messageId: "discarded" });
          }
          return;
        }
        if (id.type === "Identifier") {
          if (!bindingChecksError(scope, id.name)) {
            context.report({ node: awaitNode, messageId: "discarded" });
          }
          return;
        }
        return;
      }

      if (parent.type === "ExpressionStatement") {
        context.report({ node: awaitNode, messageId: "discarded" });
        return;
      }

      if (parent.type === "CallExpression") {
        // Reached only when the callee is NOT one of the helpers, which was
        // checked first. Handing a raw result to some other function is how
        // the check gets lost: the callee takes `data` and never sees `error`.
        context.report({ node: awaitNode, messageId: "discarded" });
        return;
      }

      // Anything else (an array element, a property, an object spread) hands
      // the whole result on, error included, so somebody else has to look.
    }

    /**
     * `const [a, b] = await Promise.all([q1, q2])`: each binding whose element
     * is a raw query is a result nobody has checked yet.
     */
    function checkPromiseAll(awaitNode, elements, scope) {
      const parent = awaitNode.parent;
      if (
        parent?.type !== "VariableDeclarator" ||
        parent.init !== awaitNode ||
        parent.id.type !== "ArrayPattern"
      ) {
        // Not unpacked here. The array itself carries the results on.
        return;
      }
      parent.id.elements.forEach((binding, index) => {
        const element = elements[index];
        if (!element || !isPostgrestChain(element)) return;
        if (!binding) {
          context.report({ node: element, messageId: "discarded" });
          return;
        }
        if (binding.type === "ObjectPattern") {
          if (!bindsError(binding)) {
            context.report({ node: element, messageId: "discarded" });
          }
          return;
        }
        if (binding.type === "Identifier") {
          if (!bindingChecksError(scope, binding.name)) {
            context.report({ node: element, messageId: "discarded" });
          }
        }
      });
    }

    return {
      // `void supabase.from(...).insert(...)` and a bare un-awaited chain are
      // never awaited, so the AwaitExpression visitor cannot see them, and
      // discarding a result by never asking for it is the same defect.
      ExpressionStatement(node) {
        let expression = unwrap(node.expression);
        if (
          expression?.type === "UnaryExpression" &&
          expression.operator === "void"
        ) {
          expression = unwrap(expression.argument);
        }
        if (expression?.type === "AwaitExpression") return;
        if (isPostgrestChain(expression)) {
          context.report({ node: expression, messageId: "discarded" });
        }
      },

      AwaitExpression(node) {
        const scope = scopeAt(node);
        const argument = unwrap(node.argument);

        const elements = promiseAllElements(argument);
        if (elements) {
          if (elements.some((el) => el && isPostgrestChain(el))) {
            checkPromiseAll(node, elements, scope);
          }
          return;
        }

        if (isHelperCall(argument)) return;

        if (isPostgrestChain(argument)) {
          checkResultConsumer(node, scope);
          return;
        }

        if (argument?.type === "Identifier") {
          const variable = resolveVariable(scope, argument.name);
          if (variable && holdsQuery(variable)) checkResultConsumer(node, scope);
        }
      },
    };
  },
};
