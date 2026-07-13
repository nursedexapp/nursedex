/**
 * Stop a new stalled-action message from being written by hand.
 *
 * This is the door closing on #673. Milestone #443 gave every async button a
 * stall message and left 21 near-identical copies of the same sentence behind,
 * each a local `STALLED` const or an inline literal. They drifted: every one of
 * those buttons is in `wait` mode, meaning a second fire duplicates a real side
 * effect, yet only 14 of the messages told the user to stay on the page. Nobody
 * noticed, because there was no one place to look.
 *
 * Centralising them is worth nothing if the 22nd literal lands next week, so
 * writing the sentence by hand now fails CI.
 *
 * WHAT IT LOOKS FOR
 *
 * A string literal that rebuilds the shape, anywhere: a `stalledMessage` prop, a
 * module-level const, or JSX text in a hand-rolled alert. The fingerprints are
 * the two clauses that only ever appear in this sentence.
 *
 * WHAT IT DELIBERATELY ALLOWS
 *
 * Copy that is genuinely NOT this sentence. The signup resend says "This is still
 * sending. Check your inbox before asking for another one," which is better than
 * anything the builder would produce, and #673 keeps the `stalledMessage` escape
 * hatch for exactly that. The rule only objects to re-implementing the shape.
 */

/**
 * The two clauses that only ever appear in the stalled sentence.
 *
 * Matching on the clauses rather than the whole string is the point: a drifted
 * copy is still a copy, and the drifted ones are the ones worth catching.
 */
const SHAPE = /Refresh to check whether|Please do not close this page/i;

/** The module that is allowed to hold the sentence, plus the tests that assert it. */
function isExempt(filename) {
  const path = filename.replace(/\\/g, "/");
  return (
    path.includes("components/ui/stalled-copy") ||
    /\.test\.(ts|tsx|mjs|js)$/.test(path)
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Build the stalled message from the button's mode instead of writing the sentence by hand (#673).",
    },
    schema: [],
    messages: {
      handWritten:
        "Don't write the stalled sentence by hand: 21 copies of it drifted apart (#673). Pass `outcome` (PendingButton and ConfirmDialog build the sentence from the `mode` they already have), or use a named constant from @/components/ui/stalled-copy. The `stalledMessage` escape hatch is for copy that is NOT this sentence.",
    },
  },

  create(context) {
    if (isExempt(context.filename ?? context.getFilename())) return {};

    function check(node, value) {
      if (typeof value === "string" && SHAPE.test(value)) {
        context.report({ node, messageId: "handWritten" });
      }
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      // `This is still processing. ...` written as a template, and JSX text.
      TemplateLiteral(node) {
        check(node, node.quasis.map((q) => q.value.cooked ?? "").join(" "));
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
