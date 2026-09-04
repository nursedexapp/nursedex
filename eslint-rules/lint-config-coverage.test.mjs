// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

// #584: the no-direct-secret-comparison guard was scoped to src/**, so a direct
// secret comparison written in scripts/ (real code that runs in CI and touches
// production credentials) shipped unguarded. This exercises the REAL project
// config, not a hand-built one, so the test fails if the guard ever narrows
// back to src/ only.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");
const configPath = path.join(repoRoot, "eslint.config.mjs");

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configPath });
});

const SECRET_COMPARISON = `if (token === process.env.CRON_SECRET) {}\n`;

/** Rule ids reported by the real config for a snippet at the given path. */
async function ruleIdsFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

// #621: applyVisibleNurseFilter was the only thing keeping hidden, suspended,
// and unverified nurses off public surfaces that use the RLS-bypassing
// service-role client, and applying it was convention alone. These run the
// REAL project config, so the guard going missing (or never being wired up)
// fails here rather than the next time someone adds a public read surface.
const UNFILTERED_NURSE_READ = `
import { createServiceRoleClient } from "@/lib/supabase/service-role";
export async function load() {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("nurse_profiles").select("slug");
  return data;
}
`;

describe("eslint.config.mjs coverage of the visible-nurse-filter guard", () => {
  it("flags an unfiltered service-role nurse read in a new public read surface", async () => {
    const ids = await ruleIdsFor(
      UNFILTERED_NURSE_READ,
      path.join(repoRoot, "src/app/(public)/nurses/example/page.tsx"),
    );
    expect(ids).toContain("local/require-visible-nurse-filter");
  });

  it("flags an unfiltered service-role nurse read in a cron route", async () => {
    const ids = await ruleIdsFor(
      UNFILTERED_NURSE_READ,
      path.join(repoRoot, "src/app/api/cron/example/route.ts"),
    );
    expect(ids).toContain("local/require-visible-nurse-filter");
  });

  it("does not flag a read that routes through applyVisibleNurseFilter", async () => {
    const ids = await ruleIdsFor(
      `
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
export async function load() {
  const supabase = createServiceRoleClient();
  const query = supabase.from("nurse_profiles").select("slug");
  const { data } = await applyVisibleNurseFilter(query);
  return data;
}
`,
      path.join(repoRoot, "src/app/(public)/nurses/example/page.tsx"),
    );
    expect(ids).not.toContain("local/require-visible-nurse-filter");
  });
});

describe("eslint.config.mjs coverage of the secret-comparison guard", () => {
  it("flags a direct secret comparison in scripts/", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "scripts/example-check.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("flags a direct secret comparison in e2e/", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "e2e/example.spec.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("still flags a direct secret comparison in src/ (no regression)", async () => {
    const ids = await ruleIdsFor(
      SECRET_COMPARISON,
      path.join(repoRoot, "src/app/api/example/route.ts"),
    );
    expect(ids).toContain("local/no-direct-secret-comparison");
  });

  it("does not flag a public NEXT_PUBLIC_ key comparison in scripts/", async () => {
    const ids = await ruleIdsFor(
      `if (k === process.env.NEXT_PUBLIC_POSTHOG_KEY) {}\n`,
      path.join(repoRoot, "scripts/example-check.ts"),
    );
    expect(ids).not.toContain("local/no-direct-secret-comparison");
  });
});

// #714. Session replay records the DOM, and the surfaces rendering personal
// data were masked one at a time. A hand-listed set of surfaces is a snapshot:
// the next page to render an email is unguarded, and nobody watches session
// recordings critically enough to notice. These run the REAL project config,
// so the guard never being wired up (or being narrowed to a directory later)
// fails here rather than the next time somebody renders an address.
const UNMASKED_EMAIL = `
export function Row({ row }: { row: { email: string } }) {
  return <span>{row.email}</span>;
}
`;

describe("eslint.config.mjs coverage of the PII masking guard", () => {
  it("flags an unmasked email on a new admin page", async () => {
    const ids = await ruleIdsFor(
      UNMASKED_EMAIL,
      path.join(repoRoot, "src/app/(admin)/admin/example/page.tsx"),
    );
    expect(ids).toContain("local/require-pii-mask");
  });

  it("flags an unmasked email in a new component", async () => {
    const ids = await ruleIdsFor(
      UNMASKED_EMAIL,
      path.join(repoRoot, "src/components/example/Example.tsx"),
    );
    expect(ids).toContain("local/require-pii-mask");
  });

  it("flags a contact detail put into an href behind only a mask", async () => {
    // The distinction the whole guard turns on: session replay records
    // attributes, so a masked mailto still ships the address.
    const ids = await ruleIdsFor(
      `
import { MASK_PII } from "@/components/ui/private";
export function C({ c }: { c: { contact_email: string } }) {
  return (
    <div className={MASK_PII}>
      <a href={\`mailto:\${c.contact_email}\`}>write</a>
    </div>
  );
}
`,
      path.join(repoRoot, "src/components/example/Contact.tsx"),
    );
    expect(ids).toContain("local/require-pii-mask");
  });

  it("does not flag a validation message keyed by field name", async () => {
    const ids = await ruleIdsFor(
      `
export function F({ errors }: { errors: { email?: string } }) {
  return <p>{errors.email}</p>;
}
`,
      path.join(repoRoot, "src/components/example/Form.tsx"),
    );
    expect(ids).not.toContain("local/require-pii-mask");
  });
});

// #847 / #986. A PostgREST call resolves to { data, error } rather than
// throwing, so `const { data } = await supabase...` turns a failed read into an
// empty answer and treats it as the truth. 283 sites did that on 4 September
// 2026. The rule ships at `warn` for the length of the sweep, held by
// scripts/db-error-ratchet.ts, so these assert the RULE ID is reported rather
// than the severity: it has to be wired into the real config from the first
// phase, or the sweep is the window in which number 284 gets written.
const DISCARDED_DB_ERROR = `
export async function load(supabase) {
  const { data } = await supabase.from("nurse_profiles").select("slug");
  return data;
}
`;

describe("eslint.config.mjs coverage of the discarded-database-error guard", () => {
  it("flags a discarded result in src/", async () => {
    const ids = await ruleIdsFor(
      DISCARDED_DB_ERROR,
      path.join(repoRoot, "src/lib/example/queries.ts"),
    );
    expect(ids).toContain("local/require-db-error-check");
  });

  it("flags a discarded result in scripts/, which #584 says is in scope", async () => {
    const ids = await ruleIdsFor(
      DISCARDED_DB_ERROR,
      path.join(repoRoot, "scripts/example-backfill.ts"),
    );
    expect(ids).toContain("local/require-db-error-check");
  });

  it("flags a discarded result in e2e/", async () => {
    const ids = await ruleIdsFor(
      DISCARDED_DB_ERROR,
      path.join(repoRoot, "e2e/example.spec.ts"),
    );
    expect(ids).toContain("local/require-db-error-check");
  });

  it("does not flag a read routed through unwrapOrThrow", async () => {
    const ids = await ruleIdsFor(
      `
import { unwrapOrThrow } from "@/lib/db/results";
export async function load(supabase) {
  return await unwrapOrThrow(
    supabase.from("nurse_profiles").select("slug"),
    "the nurse list",
  );
}
`,
      path.join(repoRoot, "src/lib/example/queries.ts"),
    );
    expect(ids).not.toContain("local/require-db-error-check");
  });
});

// #987. `void (async () => { ... await action() ... })()` sets a pending flag
// before the IIFE and clears it after the await, so a rejection skips the reset
// and the button spins forever with nothing said. It shipped three times, and
// `local/require-pending-button` passed every one of those files. The tree has
// none left, which is the case a guard cannot be told apart from one that
// matches nothing, so this proves it is wired into the REAL config.
const UNCAUGHT_ASYNC_IIFE = `
export function Control() {
  const go = () => {
    setPending(true);
    void (async () => {
      const result = await recordFamilyHire({ id: 1 });
      setPending(false);
      if (!result.success) toast.error("no");
    })();
  };
  return go;
}
`;

describe("eslint.config.mjs coverage of the uncaught async IIFE guard", () => {
  it("flags the shape in a new component", async () => {
    const ids = await ruleIdsFor(
      UNCAUGHT_ASYNC_IIFE,
      path.join(repoRoot, "src/components/example/Control.tsx"),
    );
    expect(ids).toContain("local/no-uncaught-async-iife");
  });

  it("flags it in a page too", async () => {
    const ids = await ruleIdsFor(
      UNCAUGHT_ASYNC_IIFE,
      path.join(repoRoot, "src/app/(public)/example/page.tsx"),
    );
    expect(ids).toContain("local/no-uncaught-async-iife");
  });

  it("does not flag a control routed through useInFlight", async () => {
    const ids = await ruleIdsFor(
      `
import { useInFlight } from "@/components/ui/use-in-flight";
export function Control() {
  const { run } = useInFlight();
  return () => run("confirm", async () => { await recordFamilyHire({ id: 1 }); });
}
`,
      path.join(repoRoot, "src/components/example/Control.tsx"),
    );
    expect(ids).not.toContain("local/no-uncaught-async-iife");
  });
});
