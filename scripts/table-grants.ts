/**
 * Every table has a recorded grant decision, or the build says so (#520).
 *
 * The least-privilege grants migration missed the `waitlist` table entirely.
 * It is declared as `create table waitlist` (lowercase, no schema prefix) and
 * the grep behind that migration looked for `CREATE TABLE public.`, so it was
 * never found. The migration's blanket REVOKE then silently dropped its anon
 * INSERT grant, which shipped to production and broke pre-launch signups. It
 * was caught only because an e2e test happened to cover that exact table and
 * role combination.
 *
 * Nothing checked that every table had an INTENTIONAL decision recorded
 * anywhere, so a future migration could drop or never grant access and nothing
 * would notice unless a hand written test happened to exercise it.
 *
 * TWO PLACES A TABLE MAY BE DECIDED ABOUT, and it must be in exactly one:
 * a GRANT or REVOKE naming it, or the service-role-only list. A blanket
 * statement over ALL TABLES is deliberately not a decision: reading as
 * covering everything while saying nothing about any particular table is
 * precisely what made the original defect invisible.
 *
 * The parse is schema-agnostic and case-insensitive on purpose. A parser that
 * only found the spelling somebody had in mind is the defect this replaces.
 */

/**
 * SQL with its comments removed.
 *
 * Done before anything else is read, because a table or a grant named in a
 * comment is not one, and the migrations here discuss grants at length in
 * their own headers. Judging a whole line by how it STARTS would also throw
 * away the code in front of a trailing comment (L361), so the code before the
 * marker is kept.
 *
 * A double dash inside a string literal is left alone: treating one as the
 * start of a comment would truncate the statement and silently hide whatever
 * came after it.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  let inString = false;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (inString) {
      if (sql[i] === "'") inString = false;
      out += sql[i];
      i += 1;
      continue;
    }

    if (sql[i] === "'") {
      inString = true;
      out += sql[i];
      i += 1;
      continue;
    }

    if (two === "--") {
      const end = sql.indexOf("\n", i);
      if (end === -1) break;
      // The newline is kept so statements either side stay separated.
      out += "\n";
      i = end + 1;
      continue;
    }

    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      out += " ";
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/** A table name without its schema or its quotes. */
function bareName(raw: string): string {
  const parts = raw.replace(/"/g, "").split(".");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/**
 * Every persistent table a migration creates.
 *
 * TEMP and UNLOGGED tables are skipped: neither is reachable through the Data
 * API, so demanding a grant decision for one would be a finding nobody could
 * act on, and a check that reports those teaches people to skim it.
 */
export function tablesCreatedIn(sql: string): string[] {
  const clean = stripSqlComments(sql);
  // `\s+` across the keyword gap, so a name on the next line is still found.
  // `(?!...)` keeps VIEW, INDEX and MATERIALIZED VIEW out: only TABLE counts.
  const pattern =
    /\bcreate\s+(?:temp\s+|temporary\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?("?[\w".]+"?)/gi;

  const found: string[] = [];
  for (const match of clean.matchAll(pattern)) {
    // A temporary table is matched so it cannot be mistaken for a persistent
    // one by a looser pattern later, and then dropped here.
    if (/\b(temp|temporary|unlogged)\s+table\b/i.test(match[0])) continue;
    const name = bareName(match[1]);
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Every table a migration records a decision about.
 *
 * REVOKE counts as much as GRANT. Taking access away deliberately IS the
 * decision this wants recorded, and counting only grants would demand one for
 * a table somebody had explicitly closed.
 *
 * A statement over ALL TABLES IN SCHEMA, or an ALTER DEFAULT PRIVILEGES, names
 * no table and is deliberately not counted.
 */
export function tablesGrantedIn(sql: string): string[] {
  const clean = stripSqlComments(sql);
  const pattern =
    /\b(?:grant|revoke)\b([\s\S]*?)\bon\s+(?:table\s+)?([\s\S]*?)\b(?:to|from)\b/gi;

  const found: string[] = [];
  for (const match of clean.matchAll(pattern)) {
    const target = match[2];

    // Names nothing in particular, so it decides nothing in particular. Two
    // spellings, because ALTER DEFAULT PRIVILEGES writes the second: "GRANT
    // ALL ON TABLES TO anon" has ALL as the privilege and a bare plural as the
    // target, so a guard written only for "ON ALL TABLES" reads "TABLES" as a
    // table called tables.
    if (/\ball\s+(tables|sequences|routines|functions)\b/i.test(target)) {
      continue;
    }
    if (/^\s*(tables|sequences|routines|functions)\s*$/i.test(target)) {
      continue;
    }
    // A routine, not a table.
    if (/\b(function|procedure|routine)\b/i.test(match[0])) continue;

    for (const raw of target.split(",")) {
      const name = bareName(raw.trim());
      if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) continue;
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

export interface DecisionResult {
  ok: boolean;
  /** Created, and neither granted nor allow-listed. */
  undecided: string[];
  /** Allow-listed, and no longer created anywhere. */
  staleAllowances: string[];
  /** Both granted and allow-listed, which are opposite claims. */
  contradictions: string[];
  message: string;
}

/**
 * Which tables nobody decided about, plus the two ways the record itself rots.
 *
 * A stale allowance is reported because a list that can only grow stops
 * describing the schema: an entry for a dropped table reads as a considered
 * decision about something that is not there.
 *
 * A contradiction is reported because "reachable through the Data API" and
 * "service role only" are opposite claims, and whichever is right the other is
 * a lie sitting in the file.
 */
export function tablesWithNoDecision(args: {
  created: string[];
  granted: string[];
  serviceRoleOnly: string[];
}): DecisionResult {
  const { created, granted, serviceRoleOnly } = args;

  // A parse that matched nothing reports every table as decided, which is the
  // same green tick as a schema in perfect order (L98).
  if (created.length === 0) {
    return {
      ok: false,
      undecided: [],
      staleAllowances: [],
      contradictions: [],
      message:
        "Found no tables at all in the migrations. The parse is broken, or it " +
        "was pointed at the wrong directory: either way nothing was checked.",
    };
  }

  const grantedSet = new Set(granted);
  const allowedSet = new Set(serviceRoleOnly);

  const undecided = created.filter(
    (t) => !grantedSet.has(t) && !allowedSet.has(t),
  );
  const staleAllowances = serviceRoleOnly.filter((t) => !created.includes(t));
  const contradictions = created.filter(
    (t) => grantedSet.has(t) && allowedSet.has(t),
  );

  const ok =
    undecided.length === 0 &&
    staleAllowances.length === 0 &&
    contradictions.length === 0;

  if (ok) {
    return {
      ok,
      undecided,
      staleAllowances,
      contradictions,
      message: `All ${created.length} tables carry a grant decision: ${granted.length} named in a GRANT or REVOKE, ${serviceRoleOnly.length} recorded as service role only.`,
    };
  }

  const parts: string[] = [`Checked ${created.length} tables.`];

  if (undecided.length > 0) {
    parts.push(
      `\n${undecided.length} table(s) have no recorded grant decision:\n` +
        undecided.map((t) => `  ${t}`).join("\n") +
        "\n\nEither GRANT what the Data API needs in a migration, or add the " +
        "table to SERVICE_ROLE_ONLY_TABLES saying it is deliberately " +
        "unreachable with a caller's own JWT.",
    );
  }

  if (staleAllowances.length > 0) {
    parts.push(
      `\n${staleAllowances.length} entr(y/ies) in SERVICE_ROLE_ONLY_TABLES name a table no migration creates:\n` +
        staleAllowances.map((t) => `  ${t}`).join("\n") +
        "\n\nRemove them. An entry for a table that is not there reads as a " +
        "decision about something that does not exist.",
    );
  }

  if (contradictions.length > 0) {
    parts.push(
      `\n${contradictions.length} table(s) are both granted and listed as service role only:\n` +
        contradictions.map((t) => `  ${t}`).join("\n") +
        "\n\nThose are opposite claims. Whichever is right, the other is wrong.",
    );
  }

  return {
    ok,
    undecided,
    staleAllowances,
    contradictions,
    message: parts.join("\n"),
  };
}
