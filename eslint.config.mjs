import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
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
