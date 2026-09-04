import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-uncaught-async-iife.mjs";

const linter = new Linter();

function lint(code) {
  return linter.verify(
    code,
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          ecmaFeatures: { jsx: true },
        },
      },
      plugins: { local: { rules: { "no-uncaught-async-iife": rule } } },
      rules: { "local/no-uncaught-async-iife": "error" },
    },
    "Thing.tsx",
  );
}

function expectFlagged(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages.map((m) => m.ruleId)).toEqual([
    "local/no-uncaught-async-iife",
  ]);
  return messages[0];
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

describe("the shape that left HireButton spinning forever", () => {
  it("flags a void async IIFE that awaits and never catches", () => {
    const message = expectFlagged(`
      function C() {
        const go = () => {
          setPending(true);
          void (async () => {
            const result = await recordFamilyHire({ id });
            setPending(false);
            if (!result.success) toast.error("no");
          })();
        };
        return go;
      }
    `);
    expect(message.message).toMatch(/useInFlight/);
  });

  it("flags it without the void too, since the discard is the same", () => {
    expectFlagged(`
      function C() {
        const go = () => {
          (async () => {
            await save();
          })();
        };
        return go;
      }
    `);
  });

  it("flags an async function expression IIFE", () => {
    expectFlagged(`
      function C() {
        const go = () => {
          void (async function () {
            await save();
          })();
        };
        return go;
      }
    `);
  });

  it("flags an async IIFE with no await, because a throw rejects it too", () => {
    expectFlagged(`
      function C() {
        const go = () => {
          void (async () => {
            setOpen(false);
          })();
        };
        return go;
      }
    `);
  });

  it("flags a trailing await after a try that reads as covering the body", () => {
    // The catch covers the opening only. The await after it is the one that
    // leaves the control stuck.
    expectFlagged(`
      function C() {
        const go = () => {
          void (async () => {
            try {
              await first();
            } catch (e) {
              report(e);
            }
            await second();
          })();
        };
        return go;
      }
    `);
  });

  it("flags a try with only a finally, which is the useInFlight bug itself", () => {
    // A finally clears the flag and says nothing, so the control flicks back to
    // its idle label as though the work had succeeded (#987). Only a catch can
    // tell the person what happened.
    expectFlagged(`
      function C() {
        const go = () => {
          void (async () => {
            try {
              await save();
            } finally {
              setPending(false);
            }
          })();
        };
        return go;
      }
    `);
  });

  it("flags one whose try covers only part of the body", () => {
    // The await outside the try is the one that leaves the button stuck.
    expectFlagged(`
      function C() {
        const go = () => {
          void (async () => {
            const a = await first();
            try {
              await second(a);
            } catch (e) {
              report(e);
            }
          })();
        };
        return go;
      }
    `);
  });
});

describe("what it must not flag", () => {
  it("accepts a body that is one try with a catch", () => {
    expectClean(`
      function C() {
        const go = () => {
          void (async () => {
            try {
              await save();
            } catch (error) {
              toast.error("Could not save.");
            }
          })();
        };
        return go;
      }
    `);
  });

  it("accepts a .catch() on the call itself", () => {
    expectClean(`
      function C() {
        const go = () => {
          void (async () => {
            await save();
          })().catch((error) => toast.error("Could not save."));
        };
        return go;
      }
    `);
  });

  it("accepts an awaited IIFE, because its rejection reaches the caller", () => {
    expectClean(`
      async function go() {
        await (async () => {
          await save();
        })();
      }
    `);
  });

  it("accepts a returned IIFE, for the same reason", () => {
    expectClean(`
      function go() {
        return (async () => {
          await save();
        })();
      }
    `);
  });

  it("accepts a synchronous IIFE", () => {
    expectClean(`
      const value = (() => {
        return 1;
      })();
    `);
  });

  it("accepts a discarded synchronous IIFE that returns a promise", () => {
    // Nothing here is an async function, so there is no rejection for the rule
    // to be about; the caller of save() owns it.
    expectClean(`
      function C() {
        const go = () => {
          void (() => {
            return save();
          })();
        };
        return go;
      }
    `);
  });
});
