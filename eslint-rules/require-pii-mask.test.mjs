import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./require-pii-mask.mjs";

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
      plugins: { local: { rules: { "require-pii-mask": rule } } },
      rules: { "local/require-pii-mask": "error" },
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
  expect(messages[0].ruleId).toBe("local/require-pii-mask");
  if (matcher) expect(messages[0].message).toMatch(matcher);
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

const IMPORT = `import { MASK_PII, BLOCK_PII } from "@/components/ui/private";\n`;

describe("require-pii-mask: PII rendered as text", () => {
  it("flags an email rendered with no mask", () => {
    expectRejected(
      `export function A({ row }) { return <span>{row.email}</span>; }`,
      /email/,
    );
  });

  it("flags a license number rendered with no mask", () => {
    expectRejected(
      `export function A({ row }) { return <td>{row.license_number}</td>; }`,
      /license_number/,
    );
  });

  it("flags a blog commenter's email", () => {
    expectRejected(
      `export function A({ c }) { return <p>{c.author_email}</p>; }`,
      /author_email/,
    );
  });

  it("accepts an email under a masked ancestor", () => {
    expectClean(
      IMPORT +
        `export function A({ row }) { return <div className={MASK_PII}><span>{row.email}</span></div>; }`,
    );
  });

  it("accepts an email masked on the element itself", () => {
    expectClean(
      IMPORT +
        `export function A({ row }) { return <span className={MASK_PII}>{row.email}</span>; }`,
    );
  });

  it("accepts an email under a blocked ancestor, since blocking is stronger", () => {
    expectClean(
      IMPORT +
        `export function A({ row }) { return <div className={BLOCK_PII}><span>{row.email}</span></div>; }`,
    );
  });

  it("finds the class inside a template literal of other classes", () => {
    expectClean(
      IMPORT +
        "export function A({ row }) { return <div className={`space-y-3 ${MASK_PII}`}><span>{row.email}</span></div>; }",
    );
  });
});

describe("require-pii-mask: PII inside an attribute needs blocking, not masking", () => {
  it("flags a mailto built from an email when only masked", () => {
    // Session replay records attributes. Masking hides the visible text and
    // leaves the address sitting in the href.
    expectRejected(
      IMPORT +
        "export function A({ c }) { return <div className={MASK_PII}><a href={`mailto:${c.contact_email}`}>write</a></div>; }",
      /attribute|BLOCK_PII/,
    );
  });

  it("flags a tel link when only masked", () => {
    expectRejected(
      IMPORT +
        "export function A({ c }) { return <div className={MASK_PII}><a href={`tel:${c.contact_phone}`}>call</a></div>; }",
      /attribute|BLOCK_PII/,
    );
  });

  it("accepts a mailto under a blocked ancestor", () => {
    expectClean(
      IMPORT +
        "export function A({ c }) { return <div className={BLOCK_PII}><a href={`mailto:${c.contact_email}`}>write</a></div>; }",
    );
  });

  it("flags a mailto with no protection at all", () => {
    expectRejected(
      "export function A({ c }) { return <a href={`mailto:${c.contact_email}`}>write</a>; }",
      /attribute|BLOCK_PII/,
    );
  });
});

describe("require-pii-mask: what it deliberately leaves alone", () => {
  it("ignores PII handed to another component as a prop", () => {
    // The child component is responsible for its own masking, and that child
    // is guarded by this same rule where it renders. Flagging here would fire
    // on every correct call site and teach people to disable the rule.
    expectClean(
      `export function A({ n }) { return <ContactDetailsCard contact={{ email: n.contact_email }} />; }`,
    );
  });

  it("ignores a field whose name is not PII", () => {
    expectClean(`export function A({ n }) { return <span>{n.city}</span>; }`);
  });

  it("ignores PII outside JSX entirely", () => {
    expectClean(
      `export function a(row) { const to = row.email; return sendMail(to); }`,
    );
  });

  it("ignores an email used in a non-rendering attribute of a component", () => {
    expectClean(
      `export function A({ row }) { return <Row key={row.email} data={row} />; }`,
    );
  });
});

describe("require-pii-mask: it reports each place once, and only where the value lands", () => {
  it("reports a nested render once, not once per enclosing container", () => {
    // The outer container's expression CONTAINS the inner JSX. Scanning
    // through it reported the same email twice, and a rule that cries twice
    // about one line is a rule people stop reading.
    expectRejected(
      `export function A({ row }) { return <td>{row.email ? <span>{row.email}</span> : null}</td>; }`,
      /email/,
    );
  });

  it("ignores PII used only as a condition for a class name", () => {
    // `email ? "on" : "off"` never puts the address in the DOM. Flagging it
    // sends someone to mask a value that is not there.
    expectClean(
      `export function A({ row }) { return <span className={row.email ? "a" : "b"}>x</span>; }`,
    );
  });

  it("ignores PII used only as a condition for what to render", () => {
    expectClean(
      `export function A({ row }) { return <div>{row.email ? "on file" : "none"}</div>; }`,
    );
  });

  it("still flags PII in an attribute that carries the value into the DOM", () => {
    expectRejected(
      "export function A({ row }) { return <a title={row.email}>x</a>; }",
      /attribute|BLOCK_PII/,
    );
  });
});

describe("require-pii-mask: validation messages are not the values they name", () => {
  // Every false positive the rule produced on the real codebase was this one
  // shape: an error map keyed by field name. `errors.email` is a sentence like
  // "Enter a valid email address", not an address, and masking it would hide
  // the very message the person needs in order to fix the form.
  it("ignores a field error message", () => {
    expectClean(
      `export function A({ errors }) { return <p>{errors.email}</p>; }`,
    );
  });

  it("ignores a prefixed error map", () => {
    expectClean(
      `export function A({ fieldErrors }) { return <p>{fieldErrors.email}</p>; }`,
    );
  });

  it("ignores a domain-scoped error map", () => {
    expectClean(
      `export function A({ contactErrors }) { return <p>{contactErrors.phone}</p>; }`,
    );
  });

  it("still flags the real value on an object that is not an error map", () => {
    expectRejected(
      `export function A({ row }) { return <p>{row.email}</p>; }`,
      /email/,
    );
  });
});
