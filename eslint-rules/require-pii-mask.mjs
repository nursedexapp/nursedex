/**
 * Require the session-replay mask on JSX that renders somebody else's PII.
 *
 * PostHog session replay records the DOM. rrweb masks form INPUTS by default,
 * so what a person TYPES is safe without help. What it does not touch is text
 * we RENDER, and that is where the data was actually going: a family's revealed
 * nurse phone number and email, the admin panel's lists of every user's email,
 * license numbers on the verification queue, blog commenters' emails. All of it
 * was recorded in readable form into a third party (#379).
 *
 * That was fixed surface by surface, and a hand-listed set of surfaces is only
 * ever a snapshot: the next admin page or profile field that renders an email
 * is unguarded, and nobody notices, because nobody watches session recordings
 * critically (#714). So the convention is enforced here rather than remembered.
 *
 * MASK versus BLOCK, which is the part worth getting right:
 *
 *   - Rendered as TEXT, MASK_PII is enough. Recordings show asterisks and the
 *     layout survives, so the replay stays useful.
 *   - Rendered into an ATTRIBUTE (href="mailto:...", href="tel:...", title=...)
 *     masking is NOT enough, because session replay records attributes. The
 *     visible text would be asterisks while the real address sat in the link
 *     target. Those need BLOCK_PII, which drops the element entirely.
 *
 * Scope, and what is deliberately left alone, because a rule that fires on
 * correct code teaches people to disable it:
 *
 *   - PII passed as a prop to another component is NOT flagged. The child owns
 *     its own rendering and is checked by this same rule where it renders.
 *     Flagging the call site would fire on every correct one.
 *   - Anything outside JSX is not flagged. Reading `row.email` to send a mail
 *     is not a session-replay concern.
 *   - Attributes on a capitalised (component) element are not flagged: they are
 *     props, not DOM attributes, and never reach the recording as themselves.
 *
 * Known limit, kept on purpose: this matches on FIELD NAME, so a PII value
 * renamed on the way through (`const e = row.email` then `{e}`) is not seen.
 * Following values through assignments would need type information the rule
 * does not have. The field names are the shape the data actually arrives in
 * from the database, which is the case worth guarding.
 */

/** Field names that hold somebody's personal data. */
const PII_FIELDS = new Set([
  "email",
  "author_email",
  "contact_email",
  "contact_phone",
  "phone",
  "license_number",
]);

const MASK = "MASK_PII";
const BLOCK = "BLOCK_PII";

/** The static property name of a member expression, or null if dynamic. */
function propertyName(node) {
  if (node?.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/**
 * An error map keyed by field name: `errors`, `fieldErrors`, `contactErrors`.
 *
 * Every false positive this rule produced on the real codebase was this one
 * shape. `errors.email` is a sentence like "Enter a valid email address", not
 * an address, and masking it would hide the very message somebody needs in
 * order to fix the form. The exclusion is by NAME, which is the mirror of how
 * the rule includes fields by name, and is the same trade: a value stored on
 * an object called something else entirely is not seen.
 */
function isErrorMap(node) {
  const object = node?.object;
  if (object?.type === "Identifier") return /errors?$/i.test(object.name);
  const nested = propertyName(object);
  return nested ? /errors?$/i.test(nested) : false;
}

/**
 * Every PII member expression whose VALUE lands in this expression.
 *
 * Two things are skipped, both learned by running the rule over the real
 * codebase rather than over fixtures:
 *
 * Nested JSX is not descended into. `{row.email ? <span>{row.email}</span> :
 * null}` is two expression containers, and the outer one CONTAINS the inner,
 * so scanning through reported the same address twice. A rule that complains
 * twice about one line is one people stop reading.
 *
 * Conditions are not values. `className={row.email ? "a" : "b"}` never puts an
 * address in the DOM, it only asks whether one exists, and flagging it sends
 * somebody to mask a value that is not there. So the `test` of a conditional
 * is skipped, and so is the left of `&&`, which is a guard. The left of `||`
 * and `??` is NOT skipped, because `{row.email || "none"}` really does render
 * the address.
 */
function findPii(node, found = []) {
  if (!node || typeof node !== "object") return found;

  // Visited on its own; see above.
  if (node.type === "JSXElement" || node.type === "JSXFragment") return found;

  if (node.type === "MemberExpression") {
    const name = propertyName(node);
    if (name && PII_FIELDS.has(name) && !isErrorMap(node)) {
      found.push({ node, name });
    }
    // Do not walk into the object of a member expression we have judged: the
    // interesting name is the property, and descending finds nothing new.
    return found;
  }

  if (node.type === "ConditionalExpression") {
    findPii(node.consequent, found);
    findPii(node.alternate, found);
    return found;
  }

  if (node.type === "LogicalExpression" && node.operator === "&&") {
    findPii(node.right, found);
    return found;
  }

  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((v) => findPii(v, found));
    else if (value && typeof value === "object" && value.type) {
      findPii(value, found);
    }
  }
  return found;
}

/** Does this className attribute reference the given constant? */
function classNameReferences(attribute, constant) {
  const value = attribute.value;
  if (!value) return false;
  // className={MASK_PII} or className={`a ${MASK_PII}`} or any expression
  // mentioning it. Matching the identifier anywhere in the expression is
  // deliberate: the constant is the single source of the class name, so its
  // presence is the signal, however it is composed.
  const seen = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Identifier" && node.name === constant) seen.push(node);
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object" && child.type) walk(child);
    }
  };
  walk(value);
  return seen.length > 0;
}

/** The protection carried by a JSX element itself: "block", "mask" or null. */
function protectionOn(jsxElement) {
  const attributes = jsxElement?.openingElement?.attributes ?? [];
  const className = attributes.find(
    (a) => a.type === "JSXAttribute" && a.name?.name === "className",
  );
  if (!className) return null;
  if (classNameReferences(className, BLOCK)) return "block";
  if (classNameReferences(className, MASK)) return "mask";
  return null;
}

/** The strongest protection on this node or any JSX ancestor. */
function protectionInScope(node) {
  let strongest = null;
  for (let current = node; current; current = current.parent) {
    if (current.type !== "JSXElement") continue;
    const protection = protectionOn(current);
    if (protection === "block") return "block";
    if (protection === "mask") strongest = "mask";
  }
  return strongest;
}

/** A lowercase tag is a real DOM element; a capitalised one is a component. */
function isHostElement(jsxElement) {
  const name = jsxElement?.openingElement?.name;
  return name?.type === "JSXIdentifier" && /^[a-z]/.test(name.name);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require MASK_PII or BLOCK_PII on JSX that renders personal data, so it does not reach PostHog session replay",
    },
    schema: [],
    messages: {
      unmaskedText:
        "`{{field}}` is rendered here with no session-replay mask, so PostHog records it in readable form. Put MASK_PII (from @/components/ui/private) on this element or an ancestor.",
      unmaskedAttribute:
        "`{{field}}` is rendered into the `{{attribute}}` attribute, and session replay records attributes, so masking the text is not enough: the value stays readable in the markup. Put BLOCK_PII (from @/components/ui/private) on an ancestor instead.",
    },
  },

  create(context) {
    return {
      JSXExpressionContainer(node) {
        const found = findPii(node.expression);
        if (found.length === 0) return;

        const parent = node.parent;

        // Case 1: rendered as a child, so it becomes visible text.
        if (parent?.type === "JSXElement" || parent?.type === "JSXFragment") {
          if (protectionInScope(node)) return;
          for (const { node: piiNode, name } of found) {
            context.report({
              node: piiNode,
              messageId: "unmaskedText",
              data: { field: name },
            });
          }
          return;
        }

        // Case 2: rendered into an attribute. Only DOM attributes reach the
        // recording; a prop on a component does not.
        if (parent?.type === "JSXAttribute") {
          const owner = parent.parent?.parent;
          if (owner?.type !== "JSXElement" || !isHostElement(owner)) return;
          if (protectionInScope(node) === "block") return;
          for (const { node: piiNode, name } of found) {
            context.report({
              node: piiNode,
              messageId: "unmaskedAttribute",
              data: { field: name, attribute: parent.name?.name ?? "unknown" },
            });
          }
        }
      },
    };
  },
};
