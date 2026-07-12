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
 * Names a pending flag goes by in this codebase. Gathered from the real ones,
 * not invented: pending/isPending (useTransition, useActionState), loading and
 * saving and submitting (local flags), plus the per-action ones the sweep found
 * (sending, deleting, toggling, uploading, removing, subscribing).
 */
const PENDING_NAMES = new Set([
  "pending",
  "isPending",
  "loading",
  "isLoading",
  "saving",
  "isSaving",
  "savingContact",
  "submitting",
  "isSubmitting",
  "sending",
  "isSending",
  "busy",
  "deleting",
  "isDeleting",
  "removing",
  "toggling",
  "uploading",
  "isUploading",
  "subscribing",
  "changingPassword",
]);

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
      return PENDING_NAMES.has(node.name) ? node.name : null;
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
      handRolled:
        "This button drives `disabled` from a hand-rolled `{{name}}` flag. A hung action then looks exactly like a working one: the same spinner, forever, with nothing to click (#443). Use PendingButton from @/components/ui/pending-button, which shows started, still-alive and failed as three different things. Pick `retry` mode when the action is safe to fire twice (a save, an upsert) and `wait` when it is not (a payment, an email, anything with a side effect). For a control too small to carry the panel (an icon, a menu), use the exported usePendingPhase hook and render your own. If this control is not waiting on a server write at all, silence this line with an eslint-disable saying so.",
    },
  },

  create(context) {
    let adopted = false;
    const suspects = [];

    return {
      ImportDeclaration(node) {
        if (PRIMITIVE_MODULES.has(node.source.value)) adopted = true;
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

      "Program:exit"() {
        // A file that reached for the primitive has thought about this; its
        // Cancel buttons and icon controls are allowed to share the same flag.
        if (adopted) return;
        for (const { node, name } of suspects) {
          context.report({ node, messageId: "handRolled", data: { name } });
        }
      },
    };
  },
};
