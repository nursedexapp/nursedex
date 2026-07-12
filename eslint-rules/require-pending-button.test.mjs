import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./require-pending-button.mjs";

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
      plugins: { local: { rules: { "require-pending-button": rule } } },
      rules: { "local/require-pending-button": "error" },
    },
    "Thing.tsx",
  );
}

function expectRejected(code, matcher) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/require-pending-button");
  if (matcher) expect(messages[0].message).toMatch(matcher);
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

// #659, the door closing on milestone #443. Adopting the pending primitive on
// ~40 buttons is worth nothing if the 43rd hand-rolled loading flag lands next
// week and nobody notices. A hung action that looks exactly like a working one
// is the bug; this makes it fail CI instead.

describe("a hand-rolled pending flag on a button", () => {
  it("is rejected when the file uses none of the primitives", () => {
    expectRejected(
      `
      import { Button } from "@/components/ui/button";
      export function Save() {
        const [pending, startTransition] = useTransition();
        return <Button disabled={pending}>Save</Button>;
      }
      `,
      /PendingButton/,
    );
  });

  it("is rejected however the flag is spelled", () => {
    expectRejected(`
      export function Save() {
        const [isSubmitting, setIsSubmitting] = useState(false);
        return <Button disabled={isSubmitting}>Save</Button>;
      }
    `);
    expectRejected(`
      export function Send() {
        const [loading, setLoading] = useState(false);
        return <button disabled={loading}>Send</button>;
      }
    `);
  });

  it("is rejected when the flag hides inside a compound condition", () => {
    // `disabled={pending || !email}` is the commonest shape in this repo, and a
    // rule that only matched a bare identifier would have missed most of them.
    expectRejected(`
      export function Send() {
        const [pending] = useTransition();
        return <Button disabled={pending || !email}>Send</Button>;
      }
    `);
  });
});

describe("a button with no pending state at all", () => {
  // The worse half of the bug, and the half the first version of this rule
  // missed. Sign out shipped like this: a hung sign-out looked exactly like a
  // button nobody had pressed, because there was no flag to notice and nothing
  // on screen changed. A rule that only looks for a hand-rolled flag can never
  // see it.
  it("is rejected when its click handler is async and nothing tracks pending", () => {
    expectRejected(
      `
      import { signOut } from "@/lib/auth/actions";
      export function SignOut() {
        return <Button onClick={async () => { await signOut(); }}>Sign out</Button>;
      }
      `,
      /nothing on screen changes/,
    );
  });

  it("is rejected when the handler is an async function declared above it", () => {
    expectRejected(`
      export function Save() {
        async function handleSave() {
          await savePost();
        }
        return <Button onClick={handleSave}>Save</Button>;
      }
    `);
  });

  it("is rejected when a form posts straight to a server action", () => {
    // The exact shape sign out had.
    expectRejected(`
      import { signOut } from "@/lib/auth/actions";
      export function SignOut() {
        return (
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        );
      }
    `);
  });

  it("accepts it once the component tracks pending", () => {
    expectClean(`
      import { PendingButton } from "@/components/ui/pending-button";
      export function SignOut() {
        const [pending, setPending] = useState(false);
        return (
          <PendingButton
            pending={pending}
            mode="wait"
            idleLabel="Sign out"
            workingLabel="Signing out..."
            onClick={async () => { setPending(true); await signOut(); }}
          />
        );
      }
    `);
  });

  it("leaves a synchronous button alone", () => {
    // Not every button talks to a server. A plain one has nothing to wait for.
    expectClean(`
      export function Toggle() {
        return <Button onClick={() => setOpen(true)}>Open</Button>;
      }
    `);
  });
});

describe("what the rule must not flag", () => {
  it("accepts a file that has adopted the primitive", () => {
    // The Cancel button beside a PendingButton is legitimately disabled by the
    // same flag. Keying on the file, not the button, is what keeps that quiet.
    expectClean(`
      import { PendingButton } from "@/components/ui/pending-button";
      export function Save() {
        const [pending, startTransition] = useTransition();
        return (
          <div>
            <Button variant="ghost" disabled={pending}>Cancel</Button>
            <PendingButton pending={pending} mode="wait" idleLabel="Save" workingLabel="Saving..." />
          </div>
        );
      }
    `);
  });

  it("accepts an icon or menu surface driving its own chrome from the shared clock", () => {
    // PhotoUpload, the save heart, comment moderation and the taxonomy list all
    // do this: too small for the stall panel, same clock underneath.
    expectClean(`
      import { usePendingPhase } from "@/components/ui/pending-button";
      export function Row() {
        const [pending, setPending] = useState(false);
        const { phase } = usePendingPhase({ pending });
        return <button disabled={pending} aria-label="Delete" />;
      }
    `);
    expectClean(`
      import { useInFlight } from "@/components/ui/use-in-flight";
      export function Pair() {
        const { inFlight, busy, run } = useInFlight();
        return <Button disabled={busy}>Approve</Button>;
      }
    `);
  });

  it("leaves a button alone that is disabled for a reason of its own", () => {
    // Not every disabled button is waiting on a server. This one is just
    // incomplete, and has no pending state to speak of.
    expectClean(`
      export function Save() {
        return <Button disabled={!email}>Save</Button>;
      }
    `);
  });

  it("leaves a pending flag alone that never reaches a button", () => {
    // FilterPanel wraps a navigation in a transition and dims the panel; there
    // is no server write and no button to hand back.
    expectClean(`
      export function Filters() {
        const [isPending, startTransition] = useTransition();
        return <div className={isPending ? "opacity-70" : ""} />;
      }
    `);
  });
});
