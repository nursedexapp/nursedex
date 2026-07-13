import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-hand-written-stall-copy.mjs";

const linter = new Linter();

function lint(code, filename = "Thing.tsx") {
  return linter.verify(
    code,
    {
      files: ["**/*.tsx", "**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          ecmaFeatures: { jsx: true },
        },
      },
      plugins: { local: { rules: { "no-hand-written-stall-copy": rule } } },
      rules: { "local/no-hand-written-stall-copy": "error" },
    },
    filename,
  );
}

function expectRejected(code, filename) {
  const messages = lint(code, filename);
  expect(messages.map((m) => m.ruleId)).toContain(
    "local/no-hand-written-stall-copy",
  );
}

function expectAccepted(code, filename) {
  expect(lint(code, filename)).toEqual([]);
}

// #673. Milestone #443 left 21 hand-written copies of the stalled sentence, and
// they drifted: only 14 of them told the user to stay on the page, though all 21
// buttons were in wait mode. Adopting one builder is worth nothing if the 22nd
// literal lands next week and nobody notices.

describe("no-hand-written-stall-copy", () => {
  it("rejects a stalledMessage that rewrites the sentence by hand", () => {
    expectRejected(`
      const x = <PendingButton
        mode="wait"
        stalledMessage="This is still processing. Please do not close this page. Refresh to check whether the post was deleted."
      />;
    `);
  });

  it("rejects it inside an expression container too", () => {
    expectRejected(`
      const x = <PendingButton
        mode="wait"
        stalledMessage={"This is still sending. Refresh to check whether your review went through."}
      />;
    `);
  });

  it("rejects a local const that rebuilds the sentence, which is how the 21 started", () => {
    // Every one of them began life exactly like this.
    expectRejected(`
      const STALLED =
        "This is still processing. Please do not close this page. Refresh to check whether it went through.";
    `);
  });

  it("rejects a hand-rolled alert that hard-codes the warning as JSX text", () => {
    expectRejected(`
      const x = <div role="alert">Please do not close this page. Refresh to check whether it went through.</div>;
    `);
  });

  it("accepts passing an outcome, which is the whole point", () => {
    expectAccepted(`
      const x = <PendingButton mode="wait" outcome="the post was deleted" />;
    `);
  });

  it("accepts a named constant from the copy module", () => {
    expectAccepted(`
      const x = <PendingButton mode="wait" stalledMessage={PAYMENT_STALLED} />;
    `);
  });

  it("accepts genuinely one-off copy that does not rebuild the shape", () => {
    // #673 explicitly keeps the escape hatch for copy that is not this sentence.
    // The signup resend says "Check your inbox", which is better than anything
    // the builder would produce.
    expectAccepted(`
      const x = <PendingButton
        mode="wait"
        stalledMessage="This is still sending. Check your inbox before asking for another one."
      />;
    `);
  });

  it("lets the copy module itself hold the sentence", () => {
    expectAccepted(
      `export const S = "This is still processing. Please do not close this page. Refresh to check whether it went through.";`,
      "src/components/ui/stalled-copy.ts",
    );
  });

  it("lets tests assert the sentence", () => {
    expectAccepted(
      `expect(x).toBe("This is still processing. Please do not close this page. Refresh to check whether it went through.");`,
      "src/components/ui/stalled-copy.test.tsx",
    );
  });
});
