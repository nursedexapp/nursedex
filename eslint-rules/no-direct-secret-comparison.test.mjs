import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-direct-secret-comparison.mjs";

const linter = new Linter();

/** Lint a snippet with only our rule enabled, returning its messages. */
function lint(code) {
  return linter.verify(
    code,
    {
      // Without an explicit glob, flat config only applies to **/*.js and the
      // linter reports "No matching configuration found for route.ts".
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
      plugins: { local: { rules: { "no-direct-secret-comparison": rule } } },
      rules: { "local/no-direct-secret-comparison": "error" },
    },
    "route.ts",
  );
}

/** Assert the snippet is rejected, and that it is rejected by OUR rule. */
function expectRejected(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe("local/no-direct-secret-comparison");
  expect(messages[0].message).toMatch(/verifyBearerSecret|verifySecretHeader/);
}

function expectClean(code) {
  expect(lint(code)).toEqual([]);
}

// Every shape below is a real line that shipped to production and was fixed in
// #391, #390, #406 or #546. A guard that misses any of them is theatre.
describe("the four historical bug shapes", () => {
  it("rejects a secret on the LEFT of ===", () => {
    expectRejected(`if (process.env.CRON_SECRET === header) {}`);
  });

  // #546's consulting-invoice line. The regex proposed in #547 required the
  // env var on the left, so it would have missed the very bug that motivated
  // the issue.
  it("rejects a secret on the RIGHT of ===", () => {
    expectRejected(
      `if (request.headers.get("x-admin-secret") === process.env.ADMIN_SECRET) {}`,
    );
  });

  it("rejects a secret interpolated into a template literal", () => {
    expectRejected("if (auth !== `Bearer ${process.env.CRON_SECRET}`) {}");
  });

  // The shape a syntax-only selector cannot see: stash the secret in a local,
  // then compare the local.
  it("rejects a secret compared through an intermediate variable", () => {
    expectRejected(
      `const expected = process.env.ADMIN_SECRET;\nif (provided === expected) {}`,
    );
  });
});

describe("evasions", () => {
  it("rejects computed env access", () => {
    expectRejected(`if (header === process.env["ADMIN_SECRET"]) {}`);
  });

  it("rejects a secret pulled out by destructuring", () => {
    expectRejected(
      `const { ADMIN_SECRET } = process.env;\nif (header === ADMIN_SECRET) {}`,
    );
  });

  it("rejects !== as readily as ===", () => {
    expectRejected(`if (process.env.ADMIN_SECRET !== header) {}`);
  });

  it("covers every secret env var in the repo, not just the *_SECRET ones", () => {
    expectRejected(`if (k === process.env.SUPABASE_SECRET_KEY) {}`);
    expectRejected(`if (k === process.env.TURNSTILE_SECRET_KEY) {}`);
    expectRejected(`if (k === process.env.SLACK_SIGNING_SECRET) {}`);
  });

  // #585 widened the pattern past *_SECRET: a bearer TOKEN, an API _KEY or a
  // shared PASSWORD is the same bug class as a SECRET. Each name below is a
  // real credential env var in the repo that the old /SECRET/ pattern missed.
  it("covers TOKEN, KEY and PASSWORD credential env vars (#585)", () => {
    expectRejected(`if (t === process.env.GITHUB_TOKEN) {}`);
    expectRejected(`if (t === process.env.SLACK_BOT_TOKEN) {}`);
    expectRejected(`if (t === process.env.SENTRY_AUTH_TOKEN) {}`);
    expectRejected(`if (k === process.env.ANTHROPIC_API_KEY) {}`);
    expectRejected(`if (k === process.env.RESEND_API_KEY) {}`);
    expectRejected(`if (k === process.env.POSTHOG_PERSONAL_API_KEY) {}`);
    expectRejected(`if (p === process.env.SITE_PASSWORD) {}`);
  });
});

// A guard that cries wolf gets disabled. These are all real, correct patterns
// currently in src/ and they must stay silent.
describe("legitimate patterns that must not be flagged", () => {
  it("allows the shared verifier itself", () => {
    expectClean(
      `verifySecretHeader(request.headers.get("x-admin-secret"), process.env.ADMIN_SECRET);`,
    );
    expectClean(
      `if (!verifyBearerSecret(authHeader, process.env.CRON_SECRET)) {}`,
    );
  });

  // src/app/api/auth/send-email/route.ts
  it("allows HMAC signature verification", () => {
    expectClean(
      `const secret = process.env.SUPABASE_AUTH_WEBHOOK_SECRET;\nif (!verifySignature(rawBody, request.headers, secret)) {}`,
    );
  });

  // src/app/api/admin/waitlist-export/route.ts: constant-time, fail-closed.
  it("allows a constant-time length check on buffers built from a secret", () => {
    expectClean(
      `const expected = process.env.ADMIN_SECRET;\n` +
        `const a = Buffer.from(expected);\n` +
        `const b = Buffer.from(provided);\n` +
        `if (a.length !== b.length) return false;\n` +
        `return timingSafeEqual(a, b);`,
    );
  });

  // A presence check is not a secret comparison. Flagging these would push
  // people to write fail-open code just to silence the rule.
  it("allows presence checks against undefined, null and empty string", () => {
    expectClean(`if (process.env.ADMIN_SECRET === undefined) return;`);
    expectClean(`if (process.env.ADMIN_SECRET !== null) {}`);
    expectClean(`if (process.env.ADMIN_SECRET === "") return;`);
    expectClean(
      `const secret = process.env.CRON_SECRET;\nif (secret === undefined) return;`,
    );
  });

  it("allows falsiness checks", () => {
    expectClean(`if (!process.env.ADMIN_SECRET) return;`);
    expectClean(
      `const secret = process.env.CRON_SECRET;\nif (!secret || !header) return false;`,
    );
  });

  it("ignores non-secret env vars", () => {
    expectClean(`if (process.env.NODE_ENV === "production") {}`);
    expectClean(`if (process.env.VERCEL_ENV === branch) {}`);
  });

  // The widened TOKEN|KEY pattern (#585) must not trip on genuinely public
  // keys. Every one below is exposed to the browser (NEXT_PUBLIC_) or is a
  // non-secret id, so comparing it is not a timing oracle worth guarding.
  it("ignores public NEXT_PUBLIC_* keys and non-secret ids", () => {
    expectClean(
      `if (k === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {}`,
    );
    expectClean(`if (k === process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {}`);
    expectClean(`if (k === process.env.NEXT_PUBLIC_POSTHOG_KEY) {}`);
    expectClean(`if (id === process.env.STRIPE_FAMILY_ACCESS_PRICE_ID) {}`);
    expectClean(`if (id === process.env.POSTHOG_PROJECT_ID) {}`);
  });

  // A grep would trip on this. An AST rule does not see comments at all.
  it("ignores the pattern inside comments and strings", () => {
    expectClean(`// callable with process.env.ADMIN_SECRET === header\n`);
    expectClean(`const doc = "process.env.ADMIN_SECRET === header";`);
  });

  it("ignores an unrelated local that merely shadows a secret-ish name", () => {
    expectClean(`const expected = req.query.expected;\nif (p === expected) {}`);
  });
});
