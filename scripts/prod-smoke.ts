/**
 * Post-deploy smoke check of production's permission surface (#521).
 *
 * CI runs against a database built from scratch out of the migrations. Production
 * is a database that has had those migrations applied to it, one after another,
 * over months. Those are not the same thing, and the difference is where the
 * bugs live: a migration can be correct on a fresh database and still break a
 * real user flow on the real one.
 *
 * It has happened three times:
 *
 *   042/044  granted anon and authenticated ALL privileges on every table, so
 *            RLS was the only thing between a role and a write (#387).
 *   045      the waitlist lost the grant anon needed, and signups broke.
 *   052      revoked EXECUTE from anon AND authenticated on every function,
 *            believing the explicit per-function grants from earlier migrations
 *            were "additive and unaffected". They were not. Six app-facing RPCs
 *            became callable only by service_role, in production, for weeks
 *            (#700). The worst of them was get_nurse_contact: a family clicked
 *            "Reveal contact info", the slot WAS spent and the reveal WAS
 *            written, and then the page asked for the contact with the family's
 *            own session and got "permission denied for function". Charged, and
 *            shown an empty card.
 *
 * Every one of those was green in CI and only found by a human, late. This
 * module reads production's own catalog and compares it against what the code
 * actually needs, so the next one is found by a machine, immediately.
 *
 * It is read-only: it SELECTs from pg_proc and pg_class and touches no row of
 * application data. It is safe to run against production, which is the entire
 * point, because production is the only place these bugs exist.
 *
 * Fed by `supabase db query --linked --output-format json`, whose payload is:
 *
 *   { "boundary": "...", "rows": [ {...} ], "warning": "..." }
 */

export type Role = "anon" | "authenticated";

export interface GrantRow {
  kind: "function" | "table";
  name: string;
  role: Role;
  privilege: string;
  granted: boolean;
}

interface FunctionExpectation {
  anon: boolean;
  authenticated: boolean;
  /** The flow that breaks when this is wrong. Printed in the failure. */
  why: string;
}

/**
 * Every function in the public schema, and who is meant to be able to run it.
 *
 * Exhaustive on purpose. A function in production that is missing from this
 * table fails the check, because "who is allowed to call this" is exactly the
 * question nobody asked in migration 052. A new function has to answer it.
 *
 * `anon: false, authenticated: false` is a real answer, not an omission: it
 * means service_role only (the app calls it with createServiceRoleClient) or
 * trigger-only (Postgres fires triggers regardless of the caller's EXECUTE
 * privilege, so they need no grant at all).
 */
export const FUNCTION_GRANTS: Record<string, FunctionExpectation> = {
  // ── Called by the app with the USER's client ──────────────────
  get_nurse_contact: {
    anon: false,
    authenticated: true,
    why: "a family reading the contact details of a nurse they revealed (the reveal money path)",
  },
  get_public_nurse_by_slug: {
    anon: true,
    authenticated: true,
    why: "anyone opening a nurse profile page",
  },
  calculate_distance: {
    anon: true,
    authenticated: true,
    why: "distance shown on search results (pure geo-math, no data)",
  },
  check_reveal_rate_limit: {
    anon: false,
    authenticated: true,
    why: "a family's remaining daily reveals, read before the reveal button fires",
  },
  increment_nurse_analytics: {
    anon: false,
    authenticated: true,
    why: "profile view and reveal counters on a nurse's dashboard",
  },
  increment_save_count_for_upsell: {
    anon: false,
    authenticated: true,
    why: "the save-count upsell shown to a nurse",
  },
  request_review_removal: {
    anon: false,
    authenticated: true,
    why: "a family asking for their own review to be removed",
  },
  dispute_review: {
    anon: false,
    authenticated: true,
    why: "a nurse disputing a review left about them",
  },
  // The external reviewer follows an emailed link and is NOT logged in, so anon
  // has to reach these. Both are SECURITY DEFINER and gate on the link token,
  // so the grant exposes nothing the token does not already authorise.
  submit_external_review: {
    anon: true,
    authenticated: true,
    why: "an external reviewer submitting a review from an emailed link, logged out",
  },
  verify_external_review: {
    anon: true,
    authenticated: true,
    why: "an external reviewer verifying their review from an emailed link, logged out",
  },
  // Not called directly, but referenced inside RLS policies. No CREATE POLICY in
  // this codebase scopes itself with `TO <role>`, so every policy applies to
  // PUBLIC, and Postgres must be able to evaluate it for whichever role is
  // querying. Revoke this from anon and every policy that references it starts
  // throwing "permission denied for function" instead of evaluating to false.
  is_admin: {
    anon: true,
    authenticated: true,
    why: "evaluated inside RLS policies for every role, including anon",
  },

  // ── service_role only: the app calls these with the service client ──
  reveal_nurse: {
    anon: false,
    authenticated: false,
    why: "spends a capped daily reveal and writes the reveal in one transaction; service_role only, so a client cannot spend its own slots",
  },
  consume_reveal_rate_limit: {
    anon: false,
    authenticated: false,
    why: "the daily reveal counter is system-managed; service_role only",
  },
  apply_subscription_event: {
    anon: false,
    authenticated: false,
    why: "applied from the Stripe webhook; service_role only",
  },
  complete_consulting_request: {
    anon: false,
    authenticated: false,
    why: "claims a consulting request and writes its billable time entry in one transaction (#663); service_role only, so nobody but the /done route can bill work",
  },

  // ── Dead code: deliberately left with no grant ────────────────
  get_user_role: {
    anon: false,
    authenticated: false,
    why: "dead code, no caller (migration 052 deliberately did not re-grant it)",
  },
  resolve_review_link: {
    anon: false,
    authenticated: false,
    why: "dead code, no caller left; stays revoked rather than re-opening a function nothing uses",
  },

  // ── Trigger-only: fire regardless of the caller's EXECUTE privilege ──
  handle_new_user: {
    anon: false,
    authenticated: false,
    why: "trigger on auth.users",
  },
  handle_updated_at: {
    anon: false,
    authenticated: false,
    why: "trigger, updated_at maintenance",
  },
  handle_name_change: { anon: false, authenticated: false, why: "trigger" },
  handle_credential_change: {
    anon: false,
    authenticated: false,
    why: "trigger",
  },
  recalculate_nurse_rating: {
    anon: false,
    authenticated: false,
    why: "trigger, recomputes a nurse's rating from reviews",
  },
  consulting_touch_updated_at: {
    anon: false,
    authenticated: false,
    why: "trigger",
  },
  rls_auto_enable: {
    anon: false,
    authenticated: false,
    why: "event trigger, enables RLS on new tables",
  },
  guard_users_protected_columns: {
    anon: false,
    authenticated: false,
    why: "trigger, blocks self-escalation of role / is_suspended / is_deleted",
  },
  guard_nurse_profiles_protected_columns: {
    anon: false,
    authenticated: false,
    why: "trigger, blocks self-verification of a nurse profile",
  },
  guard_reviews_self_write: {
    anon: false,
    authenticated: false,
    why: "trigger, blocks a nurse writing their own review",
  },
  guard_hires_self_write: {
    anon: false,
    authenticated: false,
    why: "trigger, blocks a nurse writing their own hire",
  },
};

interface TableExpectation {
  table: string;
  role: Role;
  privilege: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  why: string;
}

/**
 * The table privileges the money-and-signup flows cannot work without.
 *
 * TARGETED, not exhaustive: this is the grant each critical flow depends on, not
 * a full table-by-table matrix. The exhaustive intent is proven behaviourally
 * against a throwaway database in src/lib/__tests__/data-api-grants.test.ts,
 * which cannot run here because it writes. This list is the subset whose absence
 * breaks a real user in production, which is what a post-deploy check is for.
 * formatSmokeReport says so, so a green run never implies coverage it lacks.
 */
export const CRITICAL_TABLE_GRANTS: TableExpectation[] = [
  {
    table: "nurse_profiles",
    role: "anon",
    privilege: "SELECT",
    why: "a logged-out visitor browsing the nurse directory",
  },
  {
    table: "waitlist",
    role: "anon",
    privilege: "INSERT",
    why: "a logged-out visitor joining the waitlist (migration 045 broke exactly this)",
  },
  {
    table: "contact_submissions",
    role: "anon",
    privilege: "INSERT",
    why: "a logged-out visitor sending the contact form",
  },
  {
    table: "reviews",
    role: "anon",
    privilege: "SELECT",
    why: "approved reviews shown on a public nurse profile",
  },
  {
    table: "reveals",
    role: "authenticated",
    privilege: "INSERT",
    why: "a family revealing a nurse",
  },
  {
    table: "reveals",
    role: "authenticated",
    privilege: "SELECT",
    why: "a family seeing the nurses they have already revealed",
  },
  {
    table: "subscriptions",
    role: "authenticated",
    privilege: "SELECT",
    why: "checking a family holds Family Access before a reveal",
  },
  {
    table: "hires",
    role: "authenticated",
    privilege: "INSERT",
    why: "a family recording that they hired a nurse",
  },
  {
    table: "reviews",
    role: "authenticated",
    privilege: "INSERT",
    why: "a family leaving a review",
  },
  {
    table: "saved_nurses",
    role: "authenticated",
    privilege: "INSERT",
    why: "a family saving a nurse",
  },
  {
    table: "nurse_profiles",
    role: "authenticated",
    privilege: "UPDATE",
    why: "a nurse editing their own profile",
  },
  {
    table: "users",
    role: "authenticated",
    privilege: "UPDATE",
    why: "a new signup selecting their role during onboarding (migration 046 broke exactly this)",
  },
];

export interface Finding {
  message: string;
}

export interface SmokeResult {
  ok: boolean;
  findings: Finding[];
  /** How many expectations were compared, so a green run can be trusted. */
  checked: number;
}

/**
 * Pull the rows out of the CLI's JSON payload.
 *
 * Two shapes, because the workflow installs the CLI at "latest" and the payload
 * is therefore not ours to pin:
 *
 *   2.109.1   { "boundary": "...", "rows": [ ... ], "warning": "..." }
 *   newer     [ ... ]
 *
 * Both are preceded by progress lines on stdout, and those lines contain
 * brackets of their own ("WARN: config section [inbucket] is deprecated"), so
 * the payload cannot be found by looking for the first `[`. It starts at the
 * first LINE that opens with `[` or `{` and parses.
 *
 * Throws rather than returning [] on anything else. An empty or unparseable
 * result means the query never really ran, and reporting "no findings" for a
 * production nobody looked at is the precise failure this check exists to
 * prevent. (It threw on the first live run, for exactly this reason: the CLI in
 * CI returned the bare array, and it refused to guess.)
 */
export function parseGrantRows(raw: string): GrantRow[] {
  const lines = raw.split("\n");

  let parsed: unknown;
  for (let i = 0; i < lines.length; i++) {
    const opener = lines[i].trimStart()[0];
    if (opener !== "[" && opener !== "{") continue;

    try {
      parsed = JSON.parse(lines.slice(i).join("\n"));
      break;
    } catch {
      // Not the payload (a log line that merely opens with a bracket). Keep
      // looking rather than declaring the output unreadable.
    }
  }

  if (parsed === undefined) {
    throw new Error(
      `No JSON payload in the query output. Got: ${raw.slice(0, 200)}`,
    );
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed as { rows?: unknown }).rows;

  if (!Array.isArray(rows)) {
    throw new Error(
      "Query output is neither an array of rows nor an object with a `rows` array; the query did not run.",
    );
  }
  if (rows.length === 0) {
    throw new Error(
      "Query returned no rows. The catalog query matched nothing, which means it never really ran.",
    );
  }

  return rows as GrantRow[];
}

function key(kind: string, name: string, role: string, privilege: string) {
  return `${kind}:${name}:${role}:${privilege}`;
}

export function checkGrants(rows: GrantRow[]): SmokeResult {
  const findings: Finding[] = [];
  let checked = 0;

  const actual = new Map<string, boolean>();
  for (const r of rows) {
    actual.set(key(r.kind, r.name, r.role, r.privilege), r.granted);
  }

  // 1. Every declared function matches its intent, in both directions: a caller
  //    that must get in, and a role that must stay out.
  for (const [name, want] of Object.entries(FUNCTION_GRANTS)) {
    for (const role of ["anon", "authenticated"] as const) {
      const k = key("function", name, role, "EXECUTE");
      const got = actual.get(k);

      if (got === undefined) {
        findings.push({
          message: `Function ${name} is missing from production entirely (expected it to exist, for: ${want.why}).`,
        });
        continue;
      }

      checked++;
      const expected = want[role];
      if (got === expected) continue;

      findings.push(
        expected
          ? {
              message: `${role} can no longer EXECUTE ${name}. This breaks: ${want.why}.`,
            }
          : {
              message: `${role} can now EXECUTE ${name}, and should not be able to. Intent: ${want.why}.`,
            },
      );
    }
  }

  // 2. No function in production may go undeclared. Migration 052 shipped
  //    because nobody had to write down who was meant to call what.
  const declared = new Set(Object.keys(FUNCTION_GRANTS));
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.kind !== "function" || seen.has(r.name)) continue;
    seen.add(r.name);
    if (declared.has(r.name)) continue;

    findings.push({
      message: `Function ${r.name} exists in production but declares no expected grants. Add it to FUNCTION_GRANTS in scripts/prod-smoke.ts and say who is meant to call it.`,
    });
  }

  // 3. The table privileges the critical flows depend on.
  for (const want of CRITICAL_TABLE_GRANTS) {
    const k = key("table", want.table, want.role, want.privilege);
    const got = actual.get(k);

    if (got === undefined) {
      findings.push({
        message: `Table ${want.table} is missing from production entirely (expected ${want.privilege} for ${want.role}, for: ${want.why}).`,
      });
      continue;
    }

    checked++;
    if (got) continue;

    findings.push({
      message: `${want.role} can no longer ${want.privilege} on ${want.table}. This breaks: ${want.why}.`,
    });
  }

  return { ok: findings.length === 0, findings, checked };
}

export function formatSmokeReport(result: SmokeResult): string {
  const lines: string[] = [];

  if (result.ok) {
    lines.push(
      `Production permission surface: no findings (${result.checked} grants checked).`,
    );
    lines.push(
      "Functions are checked exhaustively. Table privileges are a targeted list of the grants the critical flows need, not full table coverage.",
    );
    return lines.join("\n");
  }

  lines.push(
    `Production permission surface: ${result.findings.length} finding(s) across ${result.checked} grants checked.`,
  );
  lines.push("");
  for (const f of result.findings) {
    lines.push(`  FAIL  ${f.message}`);
  }
  lines.push("");
  lines.push(
    "A migration changed what production allows. Fix it with a new migration and `npx supabase db push`; merging alone does not deploy migrations.",
  );

  return lines.join("\n");
}
