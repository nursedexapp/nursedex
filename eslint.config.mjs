import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import noDirectSecretComparison from "./eslint-rules/no-direct-secret-comparison.mjs";

export default [
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": hooksPlugin,
      local: {
        rules: { "no-direct-secret-comparison": noDirectSecretComparison },
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react/no-unescaped-entities": "off",
      // Shared secrets must go through the constant-time, fail-closed verifier
      // in src/lib/security/shared-secret.ts. Three routes shipped a plain
      // `===` against a secret (#391, #390, #406) and a fourth was missed by
      // the first sweep (#546). Comparing by hand again fails CI (#547).
      "local/no-direct-secret-comparison": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
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
