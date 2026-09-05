// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  stripSqlComments,
  tablesCreatedIn,
  tablesGrantedIn,
  tablesWithNoDecision,
} from "./table-grants";
import { readMigrationDecisions } from "./check-table-grants";
import { SERVICE_ROLE_ONLY_TABLES } from "./service-role-only-tables";

/**
 * #520. The least-privilege grants migration missed the `waitlist` table
 * entirely, because it is declared as `create table waitlist` (lowercase, no
 * schema prefix) and the grep behind that migration looked for
 * `CREATE TABLE public.`. The migration's blanket REVOKE then silently dropped
 * its anon INSERT grant, which shipped to production and broke pre-launch
 * signups. It was caught only because an e2e test happened to cover that exact
 * table and role.
 *
 * So the parse here is deliberately schema-agnostic and case-insensitive, and
 * that exact spelling is a test case rather than a comment.
 */
describe("reading past the comments", () => {
  it("drops a line comment", () => {
    expect(stripSqlComments("SELECT 1; -- CREATE TABLE ghost")).not.toMatch(
      /ghost/,
    );
  });

  it("drops a block comment, including one spanning lines", () => {
    const sql = `/*\n * GRANT ALL to anon on every table\n */\nCREATE TABLE real_one (id int);`;
    const stripped = stripSqlComments(sql);

    expect(stripped).not.toMatch(/anon/);
    expect(stripped).toMatch(/real_one/);
  });

  it("keeps code that shares a line with a comment", () => {
    // A filter that judges a whole line by how it starts throws away the code
    // in front of the comment (L361).
    expect(stripSqlComments("CREATE TABLE kept (id int); -- why")).toMatch(
      /kept/,
    );
  });

  it("leaves a double dash inside a string alone", () => {
    // Not every -- is a comment. Treating one inside a literal as the start of
    // one would silently truncate the statement and hide whatever followed.
    const sql =
      "INSERT INTO t VALUES ('a -- b'); CREATE TABLE after_it (id int);";
    expect(stripSqlComments(sql)).toMatch(/after_it/);
  });
});

describe("finding every table a migration creates", () => {
  it("finds one with a schema prefix", () => {
    expect(tablesCreatedIn("CREATE TABLE public.users (id uuid);")).toEqual([
      "users",
    ]);
  });

  it("finds one with NO schema prefix, lowercase", () => {
    // The exact spelling that caused this issue.
    expect(tablesCreatedIn("create table waitlist (id uuid);")).toEqual([
      "waitlist",
    ]);
  });

  it("finds one behind IF NOT EXISTS", () => {
    expect(
      tablesCreatedIn("CREATE TABLE IF NOT EXISTS public.hires (id uuid);"),
    ).toEqual(["hires"]);
  });

  it("finds one whose name is on the next line", () => {
    expect(
      tablesCreatedIn("CREATE TABLE\n  public.reveals (id uuid);"),
    ).toEqual(["reveals"]);
  });

  it("finds a quoted name, without the quotes", () => {
    expect(tablesCreatedIn(`CREATE TABLE "public"."users" (id uuid);`)).toEqual(
      ["users"],
    );
  });

  it("ignores a temporary or unlogged table", () => {
    // Neither is reachable through the Data API, so demanding a grant decision
    // for one would be a finding nobody can act on.
    expect(tablesCreatedIn("CREATE TEMP TABLE scratch (id int);")).toEqual([]);
    expect(
      tablesCreatedIn("CREATE TEMPORARY TABLE scratch2 (id int);"),
    ).toEqual([]);
  });

  it("ignores a table named only in a comment", () => {
    expect(tablesCreatedIn("-- CREATE TABLE ghost (id int);")).toEqual([]);
  });

  it("does not mistake a view or an index for a table", () => {
    expect(
      tablesCreatedIn(
        "CREATE VIEW v AS SELECT 1; CREATE INDEX i ON t (a); CREATE MATERIALIZED VIEW mv AS SELECT 1;",
      ),
    ).toEqual([]);
  });
});

describe("finding every table a migration decides about", () => {
  it("finds a GRANT naming a table", () => {
    expect(tablesGrantedIn("GRANT SELECT ON public.reviews TO anon;")).toEqual([
      "reviews",
    ]);
  });

  it("finds one with no schema prefix", () => {
    expect(tablesGrantedIn("grant insert on waitlist to anon;")).toEqual([
      "waitlist",
    ]);
  });

  it("finds one spelled with the optional TABLE keyword", () => {
    expect(
      tablesGrantedIn("GRANT SELECT ON TABLE public.users TO authenticated;"),
    ).toEqual(["users"]);
  });

  it("counts a REVOKE naming a table as a decision too", () => {
    // Taking access away deliberately IS the decision this check wants
    // recorded. Counting only GRANTs would demand a grant for a table somebody
    // had explicitly closed.
    expect(
      tablesGrantedIn("REVOKE ALL ON public.email_log FROM anon;"),
    ).toEqual(["email_log"]);
  });

  it("finds several named in one statement", () => {
    expect(
      tablesGrantedIn("GRANT SELECT ON public.a, public.b TO anon;").sort(),
    ).toEqual(["a", "b"]);
  });

  it("ignores a blanket grant that names no table", () => {
    // The whole point. "ALL TABLES IN SCHEMA public" is what made the original
    // defect invisible: it reads as covering everything and says nothing about
    // any particular table, so a new table inherits a decision nobody made.
    expect(
      tablesGrantedIn("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;"),
    ).toEqual([]);
    expect(
      tablesGrantedIn(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;",
      ),
    ).toEqual([]);
  });

  it("ignores a grant on a function", () => {
    expect(
      tablesGrantedIn("GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;"),
    ).toEqual([]);
  });

  it("ignores a grant named only in a comment", () => {
    expect(tablesGrantedIn("-- GRANT SELECT ON public.ghost TO anon;")).toEqual(
      [],
    );
  });
});

describe("which tables nobody decided about", () => {
  it("is empty when every table was granted or allow-listed", () => {
    const result = tablesWithNoDecision({
      created: ["users", "email_log"],
      granted: ["users"],
      serviceRoleOnly: ["email_log"],
    });

    expect(result.undecided).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("names a table with neither", () => {
    const result = tablesWithNoDecision({
      created: ["users", "waitlist"],
      granted: ["users"],
      serviceRoleOnly: [],
    });

    expect(result.undecided).toEqual(["waitlist"]);
    expect(result.ok).toBe(false);
  });

  it("names an allow-list entry for a table that no longer exists", () => {
    // A list that can only grow stops describing the schema. An entry for a
    // dropped table reads as a considered decision about something that is not
    // there, and hides that nobody has looked at the list in a year.
    const result = tablesWithNoDecision({
      created: ["users"],
      granted: ["users"],
      serviceRoleOnly: ["long_gone"],
    });

    expect(result.staleAllowances).toEqual(["long_gone"]);
    expect(result.ok).toBe(false);
  });

  it("names a table that is both granted and allow-listed", () => {
    // The two mean opposite things. A table in both was decided twice, in
    // contradiction, and whichever is right the other is a lie in the file.
    const result = tablesWithNoDecision({
      created: ["users"],
      granted: ["users"],
      serviceRoleOnly: ["users"],
    });

    expect(result.contradictions).toEqual(["users"]);
    expect(result.ok).toBe(false);
  });

  it("refuses when it found no tables at all", () => {
    // A parse that matched nothing reports every table as decided, which is
    // the same green tick as a schema in perfect order (L98).
    const result = tablesWithNoDecision({
      created: [],
      granted: [],
      serviceRoleOnly: [],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no tables/i);
  });
});

/**
 * The check itself, against the real migrations.
 *
 * Here rather than only in a script, because `npm test` is what CI runs on
 * every push: a guard reachable only by a command nobody types is a guard that
 * never runs (L400). `scripts/check-table-grants.ts` stays for the readable
 * report and for running it by hand.
 */
describe("every table in the migrations", () => {
  const { created, granted } = readMigrationDecisions();

  it("was actually read, so the case below is not vacuous", () => {
    // A parse that matched nothing reports every table as decided.
    expect(created.length).toBeGreaterThan(20);
    expect(granted.length).toBeGreaterThan(10);
  });

  it("carries a grant decision, in a migration or in the list", () => {
    const result = tablesWithNoDecision({
      created,
      granted,
      serviceRoleOnly: [...SERVICE_ROLE_ONLY_TABLES],
    });

    expect(result.ok, result.message).toBe(true);
  });

  it("finds the table this issue was opened about", () => {
    // waitlist is declared `create table waitlist`, lowercase and with no
    // schema prefix, which is exactly the spelling the grep behind the
    // least-privilege migration missed. If the parse ever stops finding it,
    // the check is back to only catching the spellings somebody had in mind.
    expect(created).toContain("waitlist");
    expect(granted).toContain("waitlist");
  });
});
