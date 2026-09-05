/**
 * What production's schema actually IS, against what the migrations describe
 * (#890).
 *
 * Migration Drift compares the version NUMBERS committed to git against the
 * versions production reports as applied. That catches a migration that never
 * ran, which is what it was written for. It cannot catch one that ran and did
 * something different from what its file says: once a version is recorded as
 * applied, production and the file can disagree in any way at all and it
 * reports "in sync" forever.
 *
 * That case is not hypothetical. Migrations 066 and 067 were applied through
 * the Supabase dashboard by hand, assembled from the files rather than
 * executed from them, and the history row recording them was written by hand
 * too. It happened to be right, verified afterwards by reading every column
 * back through the app; nothing in CI established that and nothing would have
 * noticed if it were wrong.
 *
 * THE EXPECTED SHAPE IS NOT WRITTEN DOWN ANYWHERE. It is read from a database
 * built from the migrations, through the same query run against production, so
 * a hand kept list of expected columns, which is the same defect one level up,
 * cannot drift. Nothing here parses SQL.
 */

export interface ShapeRow {
  /** column, index, constraint, enum, rls or policy. */
  kind: string;
  /** The thing's identity, stable across runs. */
  name: string;
  /** What it is: the type, the definition, the expression. */
  detail: string;
}

export interface ShapeDifference {
  kind: string;
  name: string;
  expected: string;
  actual: string;
}

export interface ShapeComparison {
  matches: boolean;
  /** Facts the migrations produce and production does not have. */
  missing: ShapeRow[];
  /** Facts production has that the migrations do not produce. */
  unexpected: ShapeRow[];
  /** Facts both have, differently. */
  different: ShapeDifference[];
  /** How many facts were compared, so "no drift" cannot mean "nothing ran". */
  compared: number;
}

/**
 * The rows out of `supabase db query --output-format json`.
 *
 * The CLI prefixes its own chatter, so the payload is found rather than
 * assumed to be the whole output. Every refusal below is its own: an empty
 * result and two schemas that agree are the same answer to a set comparison,
 * and the first is a query that never ran (L98).
 */
export function parseShapeRows(raw: string): ShapeRow[] {
  const lines = raw.split("\n");

  let parsed: unknown;
  for (let i = 0; i < lines.length; i++) {
    const opener = lines[i].trimStart()[0];
    if (opener !== "[" && opener !== "{") continue;
    try {
      parsed = JSON.parse(lines.slice(i).join("\n"));
      break;
    } catch {
      // Not the payload (a log line that merely opens with a bracket).
    }
  }

  if (parsed === undefined) {
    throw new Error(
      `No JSON payload in the query output, so the schema query did not run. Got: ${raw.slice(0, 200)}`,
    );
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed as { rows?: unknown }).rows;

  if (!Array.isArray(rows)) {
    throw new Error(
      "The query output is neither an array of rows nor an object with a `rows` array, so the schema query did not run.",
    );
  }

  if (rows.length === 0) {
    throw new Error(
      "The schema query returned no rows. An empty result and two schemas that agree are the same answer here, so this is refused rather than reported as a match.",
    );
  }

  return rows.map((r, index) => {
    const { kind, name, detail } = (r ?? {}) as Partial<ShapeRow>;
    // Two rows both missing their detail would compare equal, so a query
    // shortened by one column would report a perfectly matching schema.
    if (
      typeof kind !== "string" ||
      typeof name !== "string" ||
      typeof detail !== "string"
    ) {
      throw new Error(
        `Row ${index} does not carry kind, name and detail as strings, so the query is not the one this compares.`,
      );
    }
    return { kind, name, detail };
  });
}

/** A row's identity: kind AND name, since a name alone repeats across kinds. */
function keyOf(row: ShapeRow): string {
  return `${row.kind} ${row.name}`;
}

/**
 * The set difference, in three directions.
 *
 * A fact present in both and different is ONE finding, not also a missing one
 * and an unexpected one: reporting it three times triples the report and reads
 * as three problems.
 *
 * Order is ignored. A collection read from a store carries no order unless the
 * read declares one, and a comparison sensitive to it would fail constantly for
 * no reason and be switched off (L343).
 */
export function compareShapes(
  expected: ShapeRow[],
  actual: ShapeRow[],
): ShapeComparison {
  const expectedBy = new Map(expected.map((r) => [keyOf(r), r]));
  const actualBy = new Map(actual.map((r) => [keyOf(r), r]));

  const missing: ShapeRow[] = [];
  const unexpected: ShapeRow[] = [];
  const different: ShapeDifference[] = [];

  for (const [key, row] of expectedBy) {
    const other = actualBy.get(key);
    if (!other) {
      missing.push(row);
      continue;
    }
    if (other.detail !== row.detail) {
      different.push({
        kind: row.kind,
        name: row.name,
        expected: row.detail,
        actual: other.detail,
      });
    }
  }

  for (const [key, row] of actualBy) {
    if (!expectedBy.has(key)) unexpected.push(row);
  }

  return {
    matches:
      missing.length === 0 && unexpected.length === 0 && different.length === 0,
    missing,
    unexpected,
    different,
    compared: expectedBy.size,
  };
}

/**
 * The report.
 *
 * It says HOW MUCH it compared even when it found nothing, because "no drift"
 * from two rows and "no drift" from two thousand read the same and the first
 * means the query is broken (L98).
 *
 * The three groups are separate because each says something different to do: a
 * missing fact means a migration did not fully apply, an unexpected one means
 * something was done to production that is written down nowhere, and a
 * different one means a migration ran and did something other than its file.
 */
export function formatShapeReport(result: ShapeComparison): string {
  const header = `Compared ${result.compared} facts about the public schema.`;

  if (result.matches) {
    return `${header}\nProduction matches what the migrations build.`;
  }

  const parts: string[] = [header];

  if (result.missing.length > 0) {
    parts.push(
      `\n${result.missing.length} in the migrations but not in production:\n` +
        result.missing
          .map((r) => `  ${r.kind} ${r.name}: ${r.detail}`)
          .join("\n"),
    );
  }

  if (result.unexpected.length > 0) {
    parts.push(
      `\n${result.unexpected.length} in production but not in the migrations:\n` +
        result.unexpected
          .map((r) => `  ${r.kind} ${r.name}: ${r.detail}`)
          .join("\n"),
    );
  }

  if (result.different.length > 0) {
    parts.push(
      `\n${result.different.length} in both, and different:\n` +
        result.different
          .map(
            (d) =>
              `  ${d.kind} ${d.name}\n    migrations: ${d.expected}\n    production: ${d.actual}`,
          )
          .join("\n"),
    );
  }

  return parts.join("\n");
}
