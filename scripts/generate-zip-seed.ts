/**
 * Render the zip_codes migration and the seed.sql block from
 * data/ny_zip_codes.csv.
 *
 *   npx tsx scripts/generate-zip-seed.ts           # write the files
 *   npx tsx scripts/generate-zip-seed.ts --check   # fail if they are stale
 *
 * The --check mode is what the test uses, so a hand edit to either generated
 * file is caught rather than silently outliving the CSV it came from.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATION_FILENAME,
  parseZipCsv,
  renderMigration,
  renderSeedBlock,
  replaceSeedBlock,
} from "./zip-seed";

export const CSV_PATH = "data/ny_zip_codes.csv";
export const SEED_PATH = "supabase/seed.sql";
export const MIGRATION_PATH = join(
  "supabase",
  "migrations",
  MIGRATION_FILENAME,
);

export interface GeneratedFiles {
  migration: string;
  seedSql: string;
}

/** Render both artifacts from the CSV. Pure: reads nothing, writes nothing. */
export function generate(csvText: string, seedSqlText: string): GeneratedFiles {
  const rows = parseZipCsv(csvText);
  return {
    migration: renderMigration(rows),
    seedSql: replaceSeedBlock(seedSqlText, renderSeedBlock(rows)),
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const csv = readFileSync(CSV_PATH, "utf8");
  const seed = readFileSync(SEED_PATH, "utf8");
  const generated = generate(csv, seed);

  const stale: string[] = [];
  // A file that is not there yet is a legitimate first run. A file that is
  // there and cannot be read is a different cause, and treating it as absent
  // would quietly overwrite it.
  const current = (path: string): string => {
    try {
      return readFileSync(path, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw e;
    }
  };

  if (current(MIGRATION_PATH) !== generated.migration)
    stale.push(MIGRATION_PATH);
  if (current(SEED_PATH) !== generated.seedSql) stale.push(SEED_PATH);

  if (check) {
    if (stale.length > 0) {
      console.error(
        `Stale generated zip seed: ${stale.join(", ")}. ` +
          `Run: npx tsx scripts/generate-zip-seed.ts`,
      );
      process.exit(1);
    }
    console.log("zip seed files match data/ny_zip_codes.csv");
    return;
  }

  writeFileSync(MIGRATION_PATH, generated.migration);
  writeFileSync(SEED_PATH, generated.seedSql);
  console.log(
    stale.length === 0
      ? "zip seed files were already up to date"
      : `rewrote ${stale.join(", ")}`,
  );
}

// Only run when invoked directly, so the test can import `generate`.
if (process.argv[1]?.endsWith("generate-zip-seed.ts")) main();
