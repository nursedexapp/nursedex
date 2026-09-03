// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COMPLETENESS_FIELDS } from "./completeness";

/**
 * Every place that reads a row in order to SCORE it must read all the scored
 * fields. A caller that reads a partial row scores a partial profile and
 * writes a lower number than the nurse has earned, and search ranks on that
 * stored number (#727).
 *
 * deletePhoto composes its select from COMPLETENESS_COLUMNS, so it is safe by
 * construction. updateNurseProfile cannot: the Supabase client parses the
 * select string at the type level to give the row its shape, and a template
 * literal defeats that. So its literal is held to the same list here.
 */
const SCORING_READS = [
  {
    file: "src/lib/profile/actions.ts",
    what: "updateNurseProfile, which rescores after every profile save",
  },
];

describe("reads that feed the completeness score", () => {
  it.each(SCORING_READS)("$what reads every scored field", ({ file }) => {
    const source = readFileSync(file, "utf8");
    const selects = source.match(/\.select\(\s*"([^"]+)"/g) ?? [];
    const scoring = selects.find((sel) => sel.includes("profile_completeness") === false && sel.includes("care_philosophy"));
    expect(scoring, "no scoring select found; has it been renamed?").toBeDefined();
    for (const field of COMPLETENESS_FIELDS) {
      expect(scoring, `missing ${field}`).toContain(field);
    }
  });
});
