// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseShapeRows,
  compareShapes,
  formatShapeReport,
  type ShapeRow,
} from "./schema-drift";
import { isEnforcing, decideOutcome } from "./check-schema-drift";

/**
 * #890. Migration Drift compares the version NUMBERS committed to git against
 * the versions production reports as applied. That catches a migration that
 * never ran. It cannot catch one that ran and did something different from
 * what its file says: once a version is recorded as applied, production and
 * the file can disagree in any way at all and the check reports "in sync"
 * forever.
 *
 * That case is not hypothetical. Migrations 066 and 067 were applied through
 * the Supabase dashboard by hand, assembled from the files rather than
 * executed from them, and the history row recording them was written by hand
 * too. It happened to be right; nothing in CI established that.
 *
 * The expected shape is not restated here. It is read from a database built
 * from the migrations, so a hand kept list of expected columns, which is the
 * same defect one level up, cannot drift.
 */
const row = (kind: string, name: string, detail: string): ShapeRow => ({
  kind,
  name,
  detail,
});

describe("reading the shape a database reports", () => {
  it("takes the rows out of the query output", () => {
    const rows = parseShapeRows(
      JSON.stringify([
        { kind: "column", name: "users.id", detail: "uuid not null default -" },
      ]),
    );

    expect(rows).toEqual([
      { kind: "column", name: "users.id", detail: "uuid not null default -" },
    ]);
  });

  it("finds the payload past a line of CLI chatter", () => {
    const rows = parseShapeRows(
      `Connecting to remote database...\n[{"kind":"rls","name":"users","detail":"enabled"}]`,
    );

    expect(rows).toHaveLength(1);
  });

  it("refuses an empty result rather than reporting a matching schema", () => {
    // A query that returned nothing and two schemas that agree are the same
    // answer to a set comparison, and the first is a query that never ran
    // (L98). This is the one failure the whole check cannot afford.
    expect(() => parseShapeRows("[]")).toThrow(/no rows/i);
  });

  it("refuses output with no payload at all", () => {
    expect(() => parseShapeRows("could not connect")).toThrow(/no JSON/i);
  });

  it("refuses a row missing a field, rather than comparing undefined", () => {
    // Two rows both missing their detail would compare equal, so a query
    // shortened by one column would report a perfectly matching schema.
    expect(() =>
      parseShapeRows(JSON.stringify([{ kind: "column", name: "users.id" }])),
    ).toThrow(/kind, name and detail/i);
  });
});

describe("comparing the two", () => {
  const base = [
    row("column", "users.id", "uuid not null default -"),
    row("rls", "users", "enabled"),
  ];

  it("reports nothing when they agree", () => {
    const result = compareShapes(base, [...base]);

    expect(result.matches).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
    expect(result.different).toEqual([]);
  });

  it("does not care what order the rows arrive in", () => {
    // A collection read from a store carries no order unless the read declares
    // one, and a comparison sensitive to it would fail constantly for no
    // reason and be turned off (L343).
    const result = compareShapes(base, [...base].reverse());

    expect(result.matches).toBe(true);
  });

  it("names what production is missing", () => {
    const result = compareShapes(base, [base[0]]);

    expect(result.matches).toBe(false);
    expect(result.missing.map((r) => r.name)).toEqual(["users"]);
  });

  it("names what production has that the migrations do not", () => {
    // Something applied by hand and never written down. This is the direction
    // a version comparison can never see.
    const result = compareShapes(base, [
      ...base,
      row("column", "users.secret_note", "text null default -"),
    ]);

    expect(result.matches).toBe(false);
    expect(result.unexpected.map((r) => r.name)).toEqual(["users.secret_note"]);
  });

  it("names what exists in both but is not the same", () => {
    // The case the whole issue is about: the thing is there, so a version
    // check and a presence check both pass, and it is different.
    const result = compareShapes(base, [
      base[0],
      row("rls", "users", "DISABLED"),
    ]);

    expect(result.matches).toBe(false);
    expect(result.different).toEqual([
      {
        kind: "rls",
        name: "users",
        expected: "enabled",
        actual: "DISABLED",
      },
    ]);
    // Not also counted as missing and unexpected. One fact, one finding, or
    // the report triples its own length and reads as three problems.
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it("tells two rows apart by kind as well as name", () => {
    // "users" is both an rls row and could be a policy row on another table.
    // Keying on the name alone would let one answer for the other.
    const result = compareShapes(
      [row("rls", "users", "enabled")],
      [row("policy", "users", "enabled")],
    );

    expect(result.matches).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.unexpected).toHaveLength(1);
  });
});

describe("the report", () => {
  it("says what it compared, not only that it found nothing", () => {
    // "No drift" from a comparison of two rows and from a comparison of two
    // thousand read the same, and the first means the query is broken (L98).
    const text = formatShapeReport(
      compareShapes(
        [row("rls", "users", "enabled")],
        [row("rls", "users", "enabled")],
      ),
    );

    expect(text).toMatch(/1 fact/);
    expect(text).toMatch(/matches/i);
  });

  it("names each difference with both sides", () => {
    const text = formatShapeReport(
      compareShapes(
        [row("rls", "users", "enabled")],
        [row("rls", "users", "DISABLED")],
      ),
    );

    expect(text).toContain("users");
    expect(text).toContain("enabled");
    expect(text).toContain("DISABLED");
  });

  it("groups the three kinds of difference so each says what to do", () => {
    const text = formatShapeReport(
      compareShapes(
        [row("rls", "a", "enabled"), row("rls", "b", "enabled")],
        [row("rls", "a", "DISABLED"), row("rls", "c", "enabled")],
      ),
    );

    expect(text).toMatch(/in the migrations but not in production/i);
    expect(text).toMatch(/in production but not in the migrations/i);
    expect(text).toMatch(/in both, and different/i);
  });
});

/**
 * The one decision this check makes at run time: does a difference stop the
 * job? It ships OFF, because nobody has yet seen what a healthy comparison
 * between a hosted project and a local one looks like, and failing on the
 * platform's own additions would train everyone to ignore the job before it
 * had said anything true (L56). Turning it on is #1031 (L65).
 */
describe("whether a difference fails the job", () => {
  it("is off unless the switch is exactly on", () => {
    // Only "1". A truthiness check would read "0", "false" and "no", all of
    // which somebody would write meaning OFF, as on.
    expect(isEnforcing({})).toBe(false);
    for (const value of ["0", "false", "no", "", "true", "yes"]) {
      expect(isEnforcing({ SCHEMA_DRIFT_ENFORCE: value })).toBe(false);
    }
    expect(isEnforcing({ SCHEMA_DRIFT_ENFORCE: "1" })).toBe(true);
  });

  it("says nothing at all when the two agree", () => {
    expect(decideOutcome(true, false)).toEqual({
      exitCode: 0,
      alertTitle: null,
      note: null,
    });
    // And still nothing when enforcing: agreeing is agreeing.
    expect(decideOutcome(true, true).alertTitle).toBeNull();
  });

  it("reports a difference without failing while it is observing", () => {
    const outcome = decideOutcome(false, false);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.alertTitle).toMatch(/observing, not failing/i);
    // A job that found something and passed anyway is indistinguishable from
    // one that found nothing, unless it says which it was (L11).
    expect(outcome.note).toMatch(/OBSERVING/);
    expect(outcome.note).toMatch(/SCHEMA_DRIFT_ENFORCE=1/);
  });

  it("fails on a difference once it is enforcing", () => {
    const outcome = decideOutcome(false, true);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.alertTitle).toMatch(/not what the migrations build/i);
    // No hedging note: the exit code says it, and the alert title says it.
    expect(outcome.note).toBeNull();
  });

  it("gives the two states different alert titles", () => {
    // Same finding, different consequence. A reader has to be able to tell
    // "this stopped the build" from "this is being watched" from the message
    // alone, because that is all that reaches Slack (L11).
    expect(decideOutcome(false, true).alertTitle).not.toBe(
      decideOutcome(false, false).alertTitle,
    );
  });
});
