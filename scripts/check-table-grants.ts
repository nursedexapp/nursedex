/**
 * CI entry point for the grant decision check (#520).
 *
 * Reads every migration, finds every table created and every table a GRANT or
 * REVOKE names, and fails when a table is in neither that nor the
 * service-role-only list.
 *
 *   npx tsx scripts/check-table-grants.ts
 *
 * IT PARSES THE MIGRATIONS, not the live database. That is deliberate and it
 * is the half a live check cannot do: the question here is whether somebody
 * DECIDED, and a database only knows what it currently allows. A table granted
 * by accident and a table granted on purpose look identical to Postgres. The
 * live half is #541.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  tablesCreatedIn,
  tablesGrantedIn,
  tablesWithNoDecision,
} from "./table-grants";
import { SERVICE_ROLE_ONLY_TABLES } from "./service-role-only-tables";

const MIGRATIONS_DIR = join("supabase", "migrations");

export function readMigrationDecisions(dir = MIGRATIONS_DIR): {
  created: string[];
  granted: string[];
} {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // A directory with no migrations in it would report every table as decided,
  // which is the same green tick as a schema in perfect order (L98). The
  // comparison below refuses on an empty table list, and this makes the cause
  // of that emptiness distinct from a parse that simply found nothing.
  if (files.length === 0) {
    throw new Error(
      `No .sql files under ${dir}. Nothing was read, so nothing was checked.`,
    );
  }

  const created = new Set<string>();
  const granted = new Set<string>();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const table of tablesCreatedIn(sql)) created.add(table);
    for (const table of tablesGrantedIn(sql)) granted.add(table);
  }

  return { created: [...created].sort(), granted: [...granted].sort() };
}

function main(): void {
  const { created, granted } = readMigrationDecisions();

  const result = tablesWithNoDecision({
    created,
    granted,
    serviceRoleOnly: [...SERVICE_ROLE_ONLY_TABLES],
  });

  console.log(result.message);
  if (!result.ok) process.exit(1);
}

// Only when run directly, so the tests can import the reader above.
if (process.argv[1]?.endsWith("check-table-grants.ts")) {
  main();
}
