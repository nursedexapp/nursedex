/**
 * Ban comparing a shared secret with `===` / `!==`.
 *
 * #391, #390 and #406 each fixed a route comparing a shared secret with a
 * plain `===`: non-constant-time, and in #391's case not fail-closed when the
 * env var was unset. `src/lib/security/shared-secret.ts` now exists as the one
 * place that comparison happens. A sweep afterwards still found an inline
 * `=== process.env.ADMIN_SECRET` in consulting-invoice (#546). This rule is
 * what stops the next one (#547).
 *
 * Why an AST rule and not the grep #547 proposed: the regex in that issue,
 * `process.env.\w*SECRET\w*\s*(===|!==)`, requires the env var on the LEFT.
 * Three of the four real bugs put it on the right or inside a template
 * literal, so the grep would have passed them. Matching on structure catches
 * every operand order for free, sees through template literals, ignores the
 * pattern inside comments and strings, and can follow a secret that was first
 * assigned to a local variable.
 *
 * Deliberately NOT flagged, because each is correct and flagging it would
 * pressure someone into writing fail-open code to silence the rule:
 *   - presence checks (`secret === undefined`, `secret === ""`)
 *   - HMAC signature verification, which passes the secret to a hash
 *   - constant-time helpers that compare buffers derived from the secret
 */

/**
 * Names that read as a credential: a shared SECRET, a bearer TOKEN, an API
 * KEY, or a shared PASSWORD. #547 shipped with just /SECRET/, which covered
 * the seven secrets that existed then. #585 audited every `process.env.*` name
 * and found the pattern missed six real credentials (GITHUB_TOKEN,
 * SLACK_BOT_TOKEN, SENTRY_AUTH_TOKEN, ANTHROPIC_API_KEY, RESEND_API_KEY,
 * POSTHOG_PERSONAL_API_KEY) plus SITE_PASSWORD, which was being compared with
 * a plain `===` in two live routes. TOKEN and KEY are broad, so the public
 * carve-out below keeps genuinely public keys from tripping the rule.
 */
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|KEY/;

/**
 * Public values that match SECRET_NAME but are safe to compare loosely.
 * Anything Next.js exposes to the browser (NEXT_PUBLIC_*) is public by
 * definition: a publishable Supabase key, a Turnstile site key, a PostHog
 * client key. Flagging these would push people to silence the rule on code
 * that has no timing oracle to protect. No non-prefixed public key exists in
 * the repo today; PUBLIC_ALLOWLIST is the explicit escape hatch if one appears
 * (e.g. a bare *_PUBLISHABLE_KEY).
 */
const PUBLIC_ALLOWLIST = new Set();
function isPublicName(name) {
  return name.startsWith("NEXT_PUBLIC_") || PUBLIC_ALLOWLIST.has(name);
}

/** A credential env var name worth guarding: matches the shape, not public. */
function isSecretName(name) {
  return SECRET_NAME.test(name) && !isPublicName(name);
}

/** `process.env`, however it is spelled. */
function isProcessEnv(node) {
  return (
    node?.type === "MemberExpression" &&
    node.object?.type === "Identifier" &&
    node.object.name === "process" &&
    propertyName(node) === "env"
  );
}

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (!node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed && node.property?.type === "Literal") {
    return typeof node.property.value === "string" ? node.property.value : null;
  }
  return null;
}

/** `process.env.FOO_SECRET` or `process.env["FOO_SECRET"]`. */
function isSecretEnvAccess(node) {
  if (node?.type !== "MemberExpression" || !isProcessEnv(node.object)) {
    return false;
  }
  const name = propertyName(node);
  return name !== null && isSecretName(name);
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
 * The key a destructured binding came from, so that
 * `const { ADMIN_SECRET: s } = process.env` taints `s`. A Property node holds
 * its name on `key`, not `property`.
 */
function destructuredKey(pattern, identifier) {
  if (pattern?.type !== "ObjectPattern") return null;
  const prop = pattern.properties.find(
    (p) => p.type === "Property" && p.value === identifier,
  );
  if (!prop || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  return null;
}

/**
 * A variable holding a secret. Taint is deliberately NOT transitive: only a
 * direct `= process.env.X_SECRET` (or a destructure of `process.env`) counts.
 * `const a = Buffer.from(secret)` leaves `a` clean, so the constant-time
 * `a.length !== b.length` check in waitlist-export stays legal.
 */
function isSecretVariable(variable) {
  return (variable?.defs ?? []).some((def) => {
    if (def.type !== "Variable" || !def.node.init) return false;
    if (isSecretEnvAccess(def.node.init)) return true;
    if (isProcessEnv(def.node.init)) {
      const key = destructuredKey(def.node.id, def.name);
      return key !== null && isSecretName(key);
    }
    return false;
  });
}

/** Walk every descendant node, `parent` links excluded. */
function* descendants(node) {
  if (!node || typeof node.type !== "string") return;
  yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const child of value) yield* descendants(child);
    } else if (value && typeof value === "object") {
      yield* descendants(value);
    }
  }
}

/**
 * Does this operand reference a secret, directly or through a local? Scans the
 * whole subtree so a secret nested in a template literal or a call argument is
 * still found.
 */
function referencesSecret(node, sourceCode) {
  for (const child of descendants(node)) {
    if (isSecretEnvAccess(child)) return true;
    if (child.type === "Identifier") {
      const scope = sourceCode.getScope(child);
      if (isSecretVariable(resolveVariable(scope, child.name))) return true;
    }
  }
  return false;
}

/** `undefined`, `null`, `""`: a presence check, not a secret comparison. */
function isPresenceCheck(node) {
  return (
    node?.type === "Literal" ||
    (node?.type === "Identifier" && node.name === "undefined")
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the shared constant-time verifier for shared-secret comparisons",
    },
    schema: [],
    messages: {
      directSecretComparison:
        "Do not compare a shared secret with {{operator}}. This is not constant-time and does not fail closed when the env var is unset. Use verifyBearerSecret or verifySecretHeader from @/lib/security/shared-secret.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "!==") return;

        const leftIsSecret = referencesSecret(node.left, sourceCode);
        const rightIsSecret = referencesSecret(node.right, sourceCode);
        if (!leftIsSecret && !rightIsSecret) return;

        // Exactly one side is the secret: if the other side is a bare literal,
        // this is checking whether the secret is configured, not comparing it
        // against caller-supplied input.
        if (leftIsSecret !== rightIsSecret) {
          const other = leftIsSecret ? node.right : node.left;
          if (isPresenceCheck(other)) return;
        }

        context.report({
          node,
          messageId: "directSecretComparison",
          data: { operator: node.operator },
        });
      },
    };
  },
};
