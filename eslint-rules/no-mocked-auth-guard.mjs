/**
 * Ban a test from mocking away the authorization guard it exists to verify.
 *
 * Four cron tests (#618) replaced `verifyCronAuth` with `vi.fn()` and then
 * asserted the route returned the stub's own 401. The test verified the mock,
 * never the real CRON_SECRET comparison: stripping the guard from those routes
 * failed no test at all. The same shape appeared in the admin action tests,
 * which mock `requireAdmin` to always return an admin, and in five cron tests
 * that asserted "no email sent" against an empty result set (#629).
 *
 * A test that mocks the guard cannot fail when the guard is deleted, which is
 * the one thing it is there to catch. This is what stops the next one (#634).
 *
 * The banned names are the ones that MAKE the authorization decision. Mocking
 * the things a guard reads THROUGH is fine and often necessary:
 *
 *   - `getCurrentUser` is deliberately NOT banned. It answers "who is calling",
 *     not "may they". The boundary suite mocks the Supabase client underneath it
 *     and runs the real guard on top; banning it would leave no way to drive a
 *     caller's identity and would push people toward mocking the guard instead,
 *     which is the very thing this rule exists to prevent.
 *   - Mocking `@/lib/supabase/server`, cookies, or the session is likewise fine.
 *
 * Escape hatch: an action's happy-path test legitimately mocks `requireAdmin` so
 * it can exercise the logic past the guard, and that is safe ONLY when a
 * boundary test covers the negative direction. Silence the rule there with an
 * eslint-disable line naming the test that does:
 *
 *   // eslint-disable-next-line local/no-mocked-auth-guard -- happy-path only; the
 *   // non-admin path is covered in src/lib/admin/authz-boundary.test.ts
 *
 * The disable is the point: it makes the coupling explicit and reviewable,
 * instead of leaving a guard silently unverified.
 */

/**
 * Functions that ARE the authorization decision. Mocking one of these replaces
 * the check under test with a stub that always answers the way the test wants.
 */
const GUARD_FUNCTIONS = new Set([
  "verifyCronAuth",
  "requireAdmin",
  "requireSuperAdmin",
  // requireRole is a guard like any other: it is what keeps a family out of a
  // nurse's profile and photos. Four tests mocked it away, so the wrong-role
  // direction was verified nowhere until the boundary suite grew to cover it.
  "requireRole",
  "requireAuth",
  "verifyBearerSecret",
  "verifySecretHeader",
]);

/**
 * Modules whose entire purpose is the authorization decision. Auto-mocking one
 * (`vi.mock(path)` with no factory) replaces every export, guard included, so
 * the specifier alone is enough to flag.
 */
const GUARD_MODULES = new Set([
  "@/lib/cron/auth",
  "@/lib/security/shared-secret",
]);

/** The string value of a literal or single-quasi template argument. */
function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node?.type === "TemplateLiteral" &&
    node.quasis.length === 1 &&
    node.expressions.length === 0
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** `vi.mock(...)` / `vitest.mock(...)`, however the caller spells it. */
function isMockCall(node) {
  const callee = node.callee;
  return (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.property?.type === "Identifier" &&
    callee.property.name === "mock" &&
    callee.object?.type === "Identifier" &&
    (callee.object.name === "vi" || callee.object.name === "vitest")
  );
}

/** The object literal a mock factory returns, whether arrow-bodied or not. */
function factoryObject(factory) {
  if (!factory) return null;
  if (
    factory.type !== "ArrowFunctionExpression" &&
    factory.type !== "FunctionExpression"
  ) {
    return null;
  }
  const body = factory.body;
  if (body?.type === "ObjectExpression") return body;
  if (body?.type === "BlockStatement") {
    const ret = body.body.find((s) => s.type === "ReturnStatement");
    if (ret?.argument?.type === "ObjectExpression") return ret.argument;
  }
  return null;
}

/** The static key of an object property, or null when computed/dynamic. */
function propertyKey(prop) {
  if (prop.type !== "Property" || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban tests from mocking the authorization guard they are meant to verify",
    },
    schema: [],
    messages: {
      mockedGuardFunction:
        "This test mocks {{name}}, which IS the authorization check. A test that replaces the guard cannot fail when the guard is deleted, which is the one thing it exists to catch. Drive the real guard by mocking what it reads (the Supabase client, the session), not the guard itself. If this is a happy-path test whose negative direction is covered by a boundary test, silence this line with an eslint-disable naming that test.",
      mockedGuardModule:
        "This test auto-mocks {{name}}, replacing every export including the authorization guard. Mock what the guard reads (the Supabase client, the session) instead, so the real check still runs.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isMockCall(node)) return;

        const specifier = staticString(node.arguments[0]);
        const factory = node.arguments[1];

        // No factory: every export is replaced, guard included.
        if (!factory && specifier && GUARD_MODULES.has(specifier)) {
          context.report({
            node,
            messageId: "mockedGuardModule",
            data: { name: specifier },
          });
          return;
        }

        const object = factoryObject(factory);
        if (!object) return;

        for (const prop of object.properties) {
          const key = propertyKey(prop);
          if (key && GUARD_FUNCTIONS.has(key)) {
            context.report({
              node: prop,
              messageId: "mockedGuardFunction",
              data: { name: key },
            });
          }
        }
      },
    };
  },
};
