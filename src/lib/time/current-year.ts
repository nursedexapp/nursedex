import "server-only";

/**
 * The current calendar year, for the copyright line in the site footer (#566).
 *
 * It lives behind `server-only` deliberately. The footer used to call
 * `new Date().getFullYear()` during its own render; that is safe only for as
 * long as the footer stays a Server Component, and nothing enforced that. An
 * import of this module from a client component fails the build, so the year
 * can only ever be computed once, on the server, and cannot diverge between
 * the HTML that is sent and the tree the browser hydrates.
 *
 * The clock is injectable so the rollover can be tested without waiting for
 * December 31, which is the narrow window the original bug would have shown in.
 *
 * The year is read in UTC, not in the host's local zone, matching the one
 * timezone convention this repo already has (src/lib/slack/invoice.ts). Reading
 * it locally would make the answer depend on where the code runs: on Vercel
 * that is UTC, on this machine it is New York, and the two disagree for the
 * last five hours of every December 31.
 */
export function currentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}
