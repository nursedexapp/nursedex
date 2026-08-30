// The annotation titles CI signals are published under (#818).
//
// One definition, imported by everything that writes one and by the counter
// that reads them. They used to be string literals in three files, which is a
// name shared by convention: a shared name is read as evidence of shared
// behaviour, so the sides can drift indefinitely while each reads as correct
// on its own (L263, L41).
//
// Drift here is silent and expensive. The counter finds nothing, reports "not
// judged", and that is indistinguishable from a quiet week with no merges.
export const ANNOTATION_TITLES = {
  /**
   * Emitted by e2e/flake-reporter.ts on EVERY run, carrying
   * `FLAKY_COUNT=<n> EXECUTED=<n>`.
   *
   * On every run, not only flaky ones: a run with no annotation must mean the
   * run could not report, never that it was healthy (L223).
   */
  flakeCount: "Playwright flake count",

  /**
   * Emitted by scripts/check-merged-tree-proof.ts on every outcome, carrying
   * `OUTCOME=held|refused|unavailable`.
   */
  mergedTreeProof: "Merged tree proof",
} as const;
