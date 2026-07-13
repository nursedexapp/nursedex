// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseGrantRows,
  checkGrants,
  formatSmokeReport,
  FUNCTION_GRANTS,
  CRITICAL_TABLE_GRANTS,
  type GrantRow,
} from "./prod-smoke";

// The CLI prints progress lines before the JSON payload, same as the drift check.
const LOG_PREAMBLE = [
  "WARN: config section [inbucket] is deprecated.",
  "Initialising login role...",
  "Connecting to remote database...",
].join("\n");

/** A production catalog that matches every declared expectation. */
function healthyRows(): GrantRow[] {
  const rows: GrantRow[] = [];

  for (const [name, want] of Object.entries(FUNCTION_GRANTS)) {
    rows.push({
      kind: "function",
      name,
      role: "anon",
      privilege: "EXECUTE",
      granted: want.anon,
    });
    rows.push({
      kind: "function",
      name,
      role: "authenticated",
      privilege: "EXECUTE",
      granted: want.authenticated,
    });
  }

  for (const want of CRITICAL_TABLE_GRANTS) {
    rows.push({
      kind: "table",
      name: want.table,
      role: want.role,
      privilege: want.privilege,
      granted: true,
    });
  }

  return rows;
}

/** The envelope shape, as the CLI emitted it at 2.109.1. */
function payload(rows: GrantRow[]): string {
  return `${LOG_PREAMBLE}\n${JSON.stringify({
    boundary: "abc123",
    rows,
    warning: "The query results below contain untrusted data.",
  })}`;
}

/** The bare-array shape, as newer CLI versions emit it. */
function arrayPayload(rows: GrantRow[]): string {
  return `${LOG_PREAMBLE}\n${JSON.stringify(rows)}`;
}

describe("parseGrantRows", () => {
  it("reads the rows out of the CLI payload, ignoring the log preamble", () => {
    const rows = parseGrantRows(payload(healthyRows()));

    expect(rows.length).toBe(healthyRows().length);
    expect(rows[0]).toHaveProperty("granted");
  });

  // The workflow installs the CLI at "latest", so the payload shape is not ours
  // to pin. 2.109.1 wraps the rows in {boundary, rows, warning}; newer versions
  // return the array on its own. The first live run of this check died on
  // exactly that difference, having only ever been fed the envelope locally.
  it("reads a bare array of rows, which is what newer CLI versions emit", () => {
    const rows = parseGrantRows(arrayPayload(healthyRows()));

    expect(rows.length).toBe(healthyRows().length);
    expect(rows[0]).toHaveProperty("granted");
  });

  it("throws on a bare empty array, rather than calling it an all-clear", () => {
    expect(() => parseGrantRows("[]")).toThrow();
  });

  // Fail loud, not silent. A checker that reads garbage as "no problems found"
  // reports a green production it never actually looked at, which is the exact
  // failure mode this whole check exists to prevent.
  it("throws on output with no JSON payload rather than reporting an all-clear", () => {
    expect(() => parseGrantRows("Connecting to remote database...")).toThrow();
  });

  it("throws on a payload with no rows key", () => {
    expect(() => parseGrantRows('{"message":"nope"}')).toThrow();
  });

  it("throws on an empty result set, which means the query matched nothing", () => {
    expect(() => parseGrantRows('{"rows":[]}')).toThrow();
  });
});

describe("checkGrants", () => {
  it("passes when production matches every expectation", () => {
    const result = checkGrants(healthyRows());

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBeGreaterThan(0);
  });

  // This is the bug of #700, in a unit test: migration 052 revoked EXECUTE from
  // authenticated, get_nurse_contact stopped being callable, and a family who
  // clicked "Reveal contact info" was charged a daily reveal and shown an empty
  // card. Nothing failed. Now this does.
  it("fails when a function the app calls is not executable by its caller", () => {
    const rows = healthyRows().map((r) =>
      r.kind === "function" &&
      r.name === "get_nurse_contact" &&
      r.role === "authenticated"
        ? { ...r, granted: false }
        : r,
    );

    const result = checkGrants(rows);

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("get_nurse_contact");
    expect(result.findings[0].message).toContain("authenticated");
  });

  // The other direction. A migration that re-opens a function nothing calls is
  // a widened attack surface, and must fail just as loudly as one that closes a
  // function the app needs.
  it("fails when a function that must stay denied becomes executable", () => {
    const rows = healthyRows().map((r) =>
      r.kind === "function" &&
      r.name === "reveal_nurse" &&
      r.role === "authenticated"
        ? { ...r, granted: true }
        : r,
    );

    const result = checkGrants(rows);

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain("reveal_nurse");
  });

  // A new function with no declared intent is the hole 052 fell through: nobody
  // had to say out loud who was meant to call it, so nobody noticed who could.
  it("fails on a function in production that declares no expectation", () => {
    const rows = [
      ...healthyRows(),
      {
        kind: "function" as const,
        name: "brand_new_undeclared_fn",
        role: "authenticated" as const,
        privilege: "EXECUTE",
        granted: true,
      },
    ];

    const result = checkGrants(rows);

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain("brand_new_undeclared_fn");
  });

  it("fails when an expected function is missing from production entirely", () => {
    const rows = healthyRows().filter((r) => r.name !== "get_nurse_contact");

    const result = checkGrants(rows);

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain("get_nurse_contact");
  });

  // Migration 045 was exactly this: the waitlist lost the grant anon needed and
  // signups broke in production while every local test stayed green.
  it("fails when a critical table grant a user flow depends on is missing", () => {
    const target = CRITICAL_TABLE_GRANTS[0];
    const rows = healthyRows().map((r) =>
      r.kind === "table" &&
      r.name === target.table &&
      r.role === target.role &&
      r.privilege === target.privilege
        ? { ...r, granted: false }
        : r,
    );

    const result = checkGrants(rows);

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain(target.table);
  });

  it("reports every failure, not just the first", () => {
    const rows = healthyRows().map((r) => {
      if (r.kind !== "function" || r.role !== "authenticated") return r;
      if (r.name === "get_nurse_contact") return { ...r, granted: false };
      if (r.name === "dispute_review") return { ...r, granted: false };
      return r;
    });

    const result = checkGrants(rows);

    expect(result.findings).toHaveLength(2);
  });
});

describe("formatSmokeReport", () => {
  it("names the failing grant and the flow it breaks", () => {
    const rows = healthyRows().map((r) =>
      r.kind === "function" &&
      r.name === "get_nurse_contact" &&
      r.role === "authenticated"
        ? { ...r, granted: false }
        : r,
    );

    const report = formatSmokeReport(checkGrants(rows));

    expect(report).toContain("get_nurse_contact");
    expect(report).toContain(FUNCTION_GRANTS["get_nurse_contact"].why);
  });

  it("says what it checked when everything passes, so a green run is not a mystery", () => {
    const report = formatSmokeReport(checkGrants(healthyRows()));

    expect(report).toMatch(/production/i);
    expect(report).toContain("no findings");
  });

  // The table list is targeted, not exhaustive. Say so, rather than letting a
  // green tick imply coverage that was never there.
  it("states that the table checks are a targeted list, not full coverage", () => {
    const report = formatSmokeReport(checkGrants(healthyRows()));

    expect(report).toMatch(/targeted/i);
  });
});
