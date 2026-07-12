/**
 * Ban a page or layout from refusing a caller by hand (#649).
 *
 * THE BLIND SPOT
 *
 * Two separate checks exist to prove our pages are actually guarded, and both
 * recognise a guarded page only by its call to `requireAuth`, `requireRole`,
 * `requireAdmin` or `requireSuperAdmin`:
 *
 *   - the page completeness check (src/app/page-authz-boundary.test.tsx) scans
 *     for `await require...(` and demands a boundary test for every page it
 *     finds;
 *   - the guard mutation gate (#642, scripts/guard-mutation.ts) deliberately
 *     skips `getCurrentUser` outside API routes, and so never proves the guard
 *     could fail.
 *
 * A page that instead reads `getCurrentUser()` and redirects by hand would be
 * guarded in practice and invisible to both: no boundary test would be demanded
 * of it, and no mutation would prove its guard works. It would look protected
 * and be watched by nothing.
 *
 * Nothing does this today, so this is a blind spot rather than a live hole, and
 * making the pattern impossible is cheaper and more durable than teaching two
 * checks to recognise it.
 *
 * WHAT IT LOOKS FOR
 *
 * A redirect (or notFound) inside a page or layout, guarded by a test that
 * refuses the caller: either the ABSENCE of the user (`!user`, `user === null`,
 * `!user?.id`) or a negative role comparison (`user.role !== "admin"`).
 *
 * Every spelling of it, not just the `if`. The first version of this rule only
 * understood an if-statement, so `user || redirect("/login")` walked straight
 * past it. A guard does not need an `if` to be a guard, and a rule that only
 * understands one spelling is a rule that only half works.
 *
 * WHAT IT DELIBERATELY LEAVES ALONE
 *
 * Reading `getCurrentUser()` to RENDER is fine and common: a public page shows a
 * stranger a Sign in link and a member a dashboard link, refusing nobody. So is
 * a business redirect that happens to know who you are: the dashboard layout
 * sends a family with no zip code off to finish onboarding, which turns nobody
 * away and sits above pages that carry the real guard. Neither is an
 * authorization decision, and flagging them would make the rule noise.
 */

const GUARD_HELPERS =
  "requireAuth / requireRole / requireAdmin / requireSuperAdmin";

/** Calls that refuse the caller by ending the render. */
const REFUSALS = new Set(["redirect", "notFound", "forbidden", "unauthorized"]);

/** Does this subtree call one of the refusals? */
function containsRefusal(node) {
  let found = false;

  const walk = (n) => {
    if (!n || typeof n !== "object" || found) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (
      n.type === "CallExpression" &&
      n.callee?.type === "Identifier" &&
      REFUSALS.has(n.callee.name)
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const child = n[key];
      if (child && typeof child === "object") walk(child);
    }
  };

  walk(node);
  return found;
}

/** The identifier at the root of `user`, `user.role`, `user?.id`. */
function rootIdentifier(node) {
  let cur = node;
  while (
    cur &&
    (cur.type === "MemberExpression" || cur.type === "ChainExpression")
  ) {
    cur = cur.type === "ChainExpression" ? cur.expression : cur.object;
  }
  return cur?.type === "Identifier" ? cur.name : null;
}

/**
 * Does this test REFUSE the caller, as opposed to merely branching on who they
 * are? Refusal means asserting the user is missing, or that their role is not
 * the one required.
 */
function refusesCaller(test, users) {
  if (!test) return false;

  switch (test.type) {
    case "UnaryExpression":
      // `!user`, `!user?.id`
      if (test.operator !== "!") return false;
      return users.has(rootIdentifier(test.argument));

    case "BinaryExpression": {
      // `user === null`, `user == undefined`, `user.role !== "admin"`
      const left = rootIdentifier(test.left);
      if (!users.has(left)) return false;

      const nullish = (n) =>
        (n?.type === "Literal" && n.value === null) ||
        (n?.type === "Identifier" && n.name === "undefined");

      if (
        (test.operator === "===" || test.operator === "==") &&
        nullish(test.right)
      ) {
        return true;
      }
      // A negative comparison on the user is a role gate: `user.role !== "x"`.
      return test.operator === "!==" || test.operator === "!=";
    }

    case "LogicalExpression":
      // `!user || user.role !== "admin"`
      return (
        refusesCaller(test.left, users) || refusesCaller(test.right, users)
      );

    default:
      return false;
  }
}

/** A bare read of the user: `user`, `user.id`. Its falsiness is the guard. */
function readsUser(node, users) {
  if (!node) return false;
  if (node.type === "Identifier") return users.has(node.name);
  if (node.type === "MemberExpression" || node.type === "ChainExpression") {
    return users.has(rootIdentifier(node));
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban a page or layout from refusing a caller by hand instead of using the require* guards",
    },
    schema: [],
    messages: {
      handRolled: `This page refuses the caller by hand, from getCurrentUser(). It would be guarded in practice and invisible to both checks that prove our pages are guarded: the page completeness check only counts a page as guarded when it calls one of ${GUARD_HELPERS}, so it would never demand a boundary test for this one, and the guard mutation gate skips getCurrentUser outside API routes, so nothing would ever prove this guard can fail. It would look protected and be watched by nothing (#649). Use ${GUARD_HELPERS} instead. Reading getCurrentUser() to RENDER (a Sign in link for a stranger, a dashboard link for a member) is fine and is not what this flags.`,
    },
  },

  create(context) {
    // Identifiers bound to the result of getCurrentUser().
    const users = new Set();

    return {
      VariableDeclarator(node) {
        const init =
          node.init?.type === "AwaitExpression"
            ? node.init.argument
            : node.init;
        if (
          init?.type === "CallExpression" &&
          init.callee?.type === "Identifier" &&
          init.callee.name === "getCurrentUser" &&
          node.id?.type === "Identifier"
        ) {
          users.add(node.id.name);
        }
      },

      IfStatement(node) {
        if (users.size === 0) return;
        if (!refusesCaller(node.test, users)) return;
        if (!containsRefusal(node.consequent)) return;
        context.report({ node, messageId: "handRolled" });
      },

      // `user || redirect("/login")` and `!user && redirect("/login")`. No `if`
      // in sight, and exactly as much of a guard.
      LogicalExpression(node) {
        if (users.size === 0) return;

        const refuses =
          node.operator === "&&"
            ? // `!user && redirect(...)`
              refusesCaller(node.left, users)
            : // `user || redirect(...)`, `user ?? redirect(...)`: the guard is
              // the falsiness of the left, so a bare read of the user is enough.
              readsUser(node.left, users) || refusesCaller(node.left, users);

        if (refuses && containsRefusal(node.right)) {
          context.report({ node, messageId: "handRolled" });
        }
      },

      // `!user ? redirect("/login") : null`
      ConditionalExpression(node) {
        if (users.size === 0) return;

        if (
          refusesCaller(node.test, users) &&
          containsRefusal(node.consequent)
        ) {
          context.report({ node, messageId: "handRolled" });
          return;
        }
        // `user ? <page> : redirect("/login")`
        if (readsUser(node.test, users) && containsRefusal(node.alternate)) {
          context.report({ node, messageId: "handRolled" });
        }
      },
    };
  },
};
