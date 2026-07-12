/**
 * Stop a new async button from hand-rolling its own pending state.
 *
 * This is the door closing on milestone #443. Before it, 27 buttons tracked
 * pending with useTransition, 43 with a local flag and a handful with
 * useFormStatus, and a hung server action looked exactly like a working one: the
 * same spinner, forever, with nothing to click. Adopting the primitive on ~40
 * buttons is worth nothing if the 43rd hand-rolled flag lands next week and
 * nobody notices, so forgetting it now fails CI instead of shipping.
 *
 * WHAT IT LOOKS FOR
 *
 * A `<Button>` or `<button>` whose `disabled` is driven by a pending-looking
 * flag, in a file that imports none of the primitives. The compound shape
 * (`disabled={pending || !email}`) is deliberately matched too: it is the
 * commonest one in this repo, and a rule that only caught a bare identifier
 * would have missed most of the buttons this milestone fixed.
 *
 * WHY IT KEYS ON THE FILE, NOT THE BUTTON
 *
 * A converted surface still has buttons disabled by the same flag: the Cancel
 * next to a PendingButton, the icon buttons in a moderation row, the X on a
 * photo. Flagging those would make the rule noise, and a noisy rule gets
 * disabled. Once a file reaches for PendingButton, usePendingPhase or
 * useInFlight, it has thought about the problem, so the rule stands down.
 *
 * ESCAPE HATCH
 *
 * A control that is genuinely not waiting on a server write (a navigation
 * transition, a clipboard copy) should carry an eslint-disable naming the
 * reason, so the exemption is explicit and reviewable rather than assumed.
 */

/**
 * What a pending flag is called around here.
 *
 * A pattern, not a fixed list. The first version used an allowlist of exact
 * names and immediately mis-fired on `resendLoading`, reporting "nothing tracks
 * pending" at a component that plainly did. Flags get prefixed and suffixed
 * (savingContact, resendLoading, changingPassword), so match the stem.
 */
const PENDING_STEM =
  /(pending|loading|saving|submitting|sending|busy|uploading|deleting|removing|toggling|subscribing|changing)/i;

function isPendingName(name) {
  return typeof name === "string" && PENDING_STEM.test(name);
}

/** Modules whose use means this file has already thought about pending state. */
const PRIMITIVE_MODULES = new Set([
  "@/components/ui/pending-button",
  "@/components/ui/use-in-flight",
]);

const BUTTON_ELEMENTS = new Set(["Button", "button"]);

/** Does this expression read a pending-looking flag anywhere inside it? */
function readsPendingFlag(node) {
  if (!node) return null;
  switch (node.type) {
    case "Identifier":
      return isPendingName(node.name) ? node.name : null;
    case "LogicalExpression":
      // `pending || !email`, `busy && something`.
      return readsPendingFlag(node.left) ?? readsPendingFlag(node.right);
    case "UnaryExpression":
      return readsPendingFlag(node.argument);
    case "BinaryExpression":
      return readsPendingFlag(node.left) ?? readsPendingFlag(node.right);
    case "ConditionalExpression":
      return (
        readsPendingFlag(node.test) ??
        readsPendingFlag(node.consequent) ??
        readsPendingFlag(node.alternate)
      );
    default:
      return null;
  }
}

/** The tag name of a JSX element, when it is a plain identifier. */
function elementName(opening) {
  return opening.name?.type === "JSXIdentifier" ? opening.name.name : null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require async buttons to use the shared pending primitive rather than a hand-rolled loading flag",
    },
    schema: [],
    messages: {
      noPendingState:
        "This button fires an async action but nothing in this component tracks pending state, so nothing on screen changes while it runs: a hung action looks exactly like a button nobody pressed (#443). Sign out shipped like this. Hold a pending flag and pass it to PendingButton from @/components/ui/pending-button, which shows started, still-alive and failed as three different things. If this handler is not waiting on a server (a navigation, a clipboard copy, opening a dialog), silence this line with an eslint-disable saying so.",
      handRolled:
        "This button drives `disabled` from a hand-rolled `{{name}}` flag. A hung action then looks exactly like a working one: the same spinner, forever, with nothing to click (#443). Use PendingButton from @/components/ui/pending-button, which shows started, still-alive and failed as three different things. Pick `retry` mode when the action is safe to fire twice (a save, an upsert) and `wait` when it is not (a payment, an email, anything with a side effect). For a control too small to carry the panel (an icon, a menu), use the exported usePendingPhase hook and render your own. If this control is not waiting on a server write at all, silence this line with an eslint-disable saying so.",
    },
  },

  create(context) {
    let adopted = false;
    // Does this component hold ANY pending state? Not "is it the right shape":
    // merely declaring one means the author thought about the running state, and
    // the hand-rolled check below then has something to catch.
    let tracksPending = false;
    const suspects = [];
    const blind = [];
    // Names of async functions declared in the file, so `onClick={handleSave}`
    // can be traced back to an `async function handleSave()`.
    const asyncFunctions = new Set();

    /** Is this expression something that awaits a server? */
    function isAsyncHandler(node) {
      if (!node) return false;
      if (
        (node.type === "ArrowFunctionExpression" ||
          node.type === "FunctionExpression") &&
        node.async
      ) {
        return true;
      }
      // `onClick={handleSave}` / `action={signOut}`: an async function declared
      // here, or a server action imported from a lib/**/actions module.
      if (node.type === "Identifier") return asyncFunctions.has(node.name);
      return false;
    }

    return {
      ImportDeclaration(node) {
        if (PRIMITIVE_MODULES.has(node.source.value)) adopted = true;
        // A server action, imported straight into a form's `action` or a click
        // handler, is the shape sign out had.
        if (/\/actions?$/.test(node.source.value)) {
          for (const spec of node.specifiers) {
            if (spec.local?.name) asyncFunctions.add(spec.local.name);
          }
        }
      },

      "FunctionDeclaration[async=true]"(node) {
        if (node.id?.name) asyncFunctions.add(node.id.name);
      },

      "VariableDeclarator > ArrowFunctionExpression[async=true]"(node) {
        const id = node.parent.id;
        if (id?.type === "Identifier") asyncFunctions.add(id.name);
      },

      // Any pending-looking binding at all, however it is produced.
      VariableDeclarator(node) {
        const id = node.id;
        if (id?.type === "Identifier" && isPendingName(id.name)) {
          tracksPending = true;
        }
        if (id?.type === "ArrayPattern") {
          for (const el of id.elements) {
            if (el?.type === "Identifier" && isPendingName(el.name)) {
              tracksPending = true;
            }
          }
        }
        if (id?.type === "ObjectPattern") {
          for (const prop of id.properties) {
            const key = prop.key?.name ?? prop.value?.name;
            if (isPendingName(key)) tracksPending = true;
          }
        }
      },

      JSXAttribute(node) {
        if (node.name?.name !== "disabled") return;
        if (node.value?.type !== "JSXExpressionContainer") return;

        const opening = node.parent;
        if (opening?.type !== "JSXOpeningElement") return;
        if (!BUTTON_ELEMENTS.has(elementName(opening))) return;

        const name = readsPendingFlag(node.value.expression);
        if (name) suspects.push({ node, name });
      },

      // The other half of the bug: an async button with NO pending state at all.
      // A rule that only looks for a hand-rolled flag can never see this one, and
      // it is the worse of the two: nothing on screen moves at all.
      "JSXAttribute[name.name=/^(onClick|action)$/]"(node) {
        if (node.value?.type !== "JSXExpressionContainer") return;
        const opening = node.parent;
        if (opening?.type !== "JSXOpeningElement") return;

        const tag = elementName(opening);
        const isButton = BUTTON_ELEMENTS.has(tag);
        const isForm = tag === "form" && node.name.name === "action";
        if (!isButton && !isForm) return;

        if (isAsyncHandler(node.value.expression)) blind.push(node);
      },

      "Program:exit"() {
        // A file that reached for the primitive has thought about this; its
        // Cancel buttons and icon controls are allowed to share the same flag.
        if (adopted) return;

        for (const { node, name } of suspects) {
          context.report({ node, messageId: "handRolled", data: { name } });
        }

        // Only worth saying when the component holds no pending state at all.
        // Once it holds one, the hand-rolled report above is the accurate
        // complaint and saying both would be noise.
        if (tracksPending) return;
        for (const node of blind) {
          context.report({ node, messageId: "noPendingState" });
        }
      },
    };
  },
};
