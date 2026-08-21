import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * No raw control character may appear in a migration or in seed.sql.
 *
 * Migration 005 held a carriage return INSIDE a string literal, between the
 * last letter and the closing quote, rather than as a line ending. 217
 * production rows have carried a state of "NY" plus chr(13) ever since.
 * Nothing read the column, so nothing complained, and the value looks correct
 * in every editor and every diff. It surfaced only when a count of
 * state = 'NY' came back 217 short (#772).
 *
 * This guards the class, not the instance: any invisible byte baked into seed
 * data becomes stored data that no reader can see and that every comparison
 * silently misses. An escape spelled out in the source is fine; a raw byte is
 * not.
 */

const MIGRATIONS_DIR = join("supabase", "migrations");

/**
 * The one file this cannot hold to the rule, because it is the file that broke
 * it. Migration 005 is applied to production and is not rewritten after the
 * fact. Its damage has a named reviewer instead: migration 064 trims the rows
 * and asserts none are left, and migration 065 asserts a floor on the rows a
 * state = 'NY' count can actually see.
 */
const HISTORICAL_EXEMPTION = "005_seed_data.sql";

// Everything below U+0020 except tab and newline, plus DEL.
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F]/;

function sqlFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => f !== HISTORICAL_EXEMPTION)
    .map((f) => join(MIGRATIONS_DIR, f));
  files.push(join("supabase", "seed.sql"));
  return files;
}

function offendersIn(text: string): string[] {
  return text
    .split("\n")
    .map((line, i) => ({ line, number: i + 1 }))
    .filter(({ line }) => CONTROL_CHARACTER.test(line))
    .map(({ line, number }) => {
      const found = [...line]
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => CONTROL_CHARACTER.test(c))
        .map(
          ({ c, i }) =>
            `U+${c
              .charCodeAt(0)
              .toString(16)
              .padStart(4, "0")
              .toUpperCase()} at column ${i + 1}`,
        );
      return `line ${number}: ${found.join(", ")}`;
    });
}

describe("migration and seed SQL", () => {
  const files = sqlFiles();

  it("finds the files it is meant to be checking", () => {
    // A guard that scans an empty list passes hardest when it is blind.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(join("supabase", "seed.sql"));
  });

  // The positive control. Without it, every assertion below could be passing
  // because the detector never fires on anything at all.
  it("detects the carriage return that started this", () => {
    const historical = readFileSync(
      join(MIGRATIONS_DIR, HISTORICAL_EXEMPTION),
      "utf8",
    );
    expect(offendersIn(historical).length).toBeGreaterThan(0);
  });

  it.each(files)("%s holds no raw control characters", (file) => {
    const offenders = offendersIn(readFileSync(file, "utf8"));
    expect(
      offenders,
      `${file} contains raw control characters. Inside a string literal they ` +
        `become stored data that no reader can see. Write an escape instead.`,
    ).toEqual([]);
  });
});
