import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import noDirectSecretComparison from "./eslint-rules/no-direct-secret-comparison.mjs";
import requireVisibleNurseFilter from "./eslint-rules/require-visible-nurse-filter.mjs";
import noMockedAuthGuard from "./eslint-rules/no-mocked-auth-guard.mjs";
import requirePendingButton from "./eslint-rules/require-pending-button.mjs";
import noHandRolledPageGuard from "./eslint-rules/no-hand-rolled-page-guard.mjs";
import noHandWrittenStallCopy from "./eslint-rules/no-hand-written-stall-copy.mjs";

export default [
  ...tseslint.configs.recommended,
  {
    // Security and hygiene rules apply to ALL first-party TypeScript, not just
    // src/. scripts/ (migration drift check, seed, launch cleanup), e2e/, and
    // the root config files run in CI and touch production credentials, so the
    // secret-comparison guard has to see them too (#584); scoping it to src/
    // left a whole directory of credential-handling code unguarded.
    files: ["**/*.{ts,tsx}"],
    plugins: {
      local: {
        rules: {
          "no-direct-secret-comparison": noDirectSecretComparison,
          "require-visible-nurse-filter": requireVisibleNurseFilter,
          // Registered here because flat config allows the `local` namespace to
          // be defined once; the rule itself is switched on for tests only,
          // below.
          "no-mocked-auth-guard": noMockedAuthGuard,
          "require-pending-button": requirePendingButton,
          "no-hand-rolled-page-guard": noHandRolledPageGuard,
          "no-hand-written-stall-copy": noHandWrittenStallCopy,
        },
      },
    },
    rules: {
      // Shared secrets must go through the constant-time, fail-closed verifier
      // in src/lib/security/shared-secret.ts. Three routes shipped a plain
      // `===` against a secret (#391, #390, #406) and a fourth was missed by
      // the first sweep (#546). Comparing by hand again fails CI (#547).
      "local/no-direct-secret-comparison": "error",
      // The service-role client bypasses RLS, so on those queries
      // applyVisibleNurseFilter is the only thing keeping unverified, hidden,
      // deleted, and suspended nurses off public surfaces. Applying it was
      // convention until #621; forgetting it on a new read surface now fails
      // CI. The three reads that intentionally see non-public profiles carry
      // an eslint-disable with the reason at the query.
      "local/require-visible-nurse-filter": "error",
      // An async button that hand-rolls its own loading flag makes a hung server
      // action look exactly like a working one: the same spinner, forever, with
      // nothing to click (#443). 27 buttons tracked pending with useTransition
      // and 43 with a local flag before the sweep; forgetting the primitive on
      // the next one now fails CI rather than shipping (#659). Controls that are
      // not waiting on a server write (a navigation transition, a clipboard
      // copy) carry an eslint-disable saying so.
      "local/require-pending-button": "error",
      // The stalled sentence had 21 hand-written copies and they drifted: all 21
      // buttons were wait mode, but only 14 told the user to stay on the page
      // (#673). Callers now pass an `outcome` and the button builds the sentence
      // from its own mode. Writing it by hand again fails CI.
      "local/no-hand-written-stall-copy": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Only tests can mock, so this rule only has to see them. e2e specs are
    // included: they drive the real app, and a guard stubbed there would be just
    // as circular.
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      // A test that mocks away the authorization guard it exists to verify
      // cannot fail when that guard is deleted, which is the one thing it is
      // there to catch. Four cron tests stubbed verifyCronAuth and asserted the
      // route returned the stub's own 401 (#618): removing the real guard failed
      // no test at all. Happy-path tests that mock requireAdmin carry an
      // eslint-disable naming the boundary test that covers the negative
      // direction, so the coupling is explicit rather than assumed (#634).
      "local/no-mocked-auth-guard": "error",
      // A test may hand-roll a pending flag freely: its fake buttons exist to
      // drive the primitive, not to ship. Enforcing it there would only make
      // the rule's own harness illegal.
      "local/require-pending-button": "off",
    },
  },
  {
    // Only a page or a layout can be the thing a visitor lands on, so only they
    // can hand-roll the guard that decides whether they may.
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: {
      // A page that reads getCurrentUser() and refuses the caller by hand is
      // guarded in practice but invisible to BOTH checks that prove our pages
      // are guarded: the completeness check only recognises the require*
      // helpers, and the mutation gate skips getCurrentUser outside API routes.
      // It would look protected and be watched by nothing. Nothing does this
      // today, and this rule is what keeps it that way (#649).
      "local/no-hand-rolled-page-guard": "error",
    },
  },
  {
    // Next.js and React rules are only meaningful for the app itself.
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react/no-unescaped-entities": "off",
      // Our dropdown menu wraps @base-ui, whose Menu.Item only fires onClick.
      // onSelect is a Radix prop that Base UI silently ignores, so an item
      // wired with it does nothing. Ban it so the mistake fails CI, not prod.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name=/^DropdownMenu(Item|CheckboxItem|RadioItem)$/] > JSXAttribute[name.name='onSelect']",
          message:
            "DropdownMenu items wrap @base-ui, which ignores onSelect (a Radix prop). Use onClick instead.",
        },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    ignores: ["node_modules/", ".next/", "public/"],
  },
];
