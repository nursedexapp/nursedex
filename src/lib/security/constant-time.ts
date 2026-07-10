/**
 * Constant-time string equality that runs in any runtime, including the edge
 * runtime where `node:crypto` is unavailable.
 *
 * `shared-secret.ts` uses `node:crypto.timingSafeEqual` (the C-level gold
 * standard) and stays the home for the Node-only route handlers and cron jobs.
 * This pure-JS twin exists only because the CSP/auth proxy (`src/proxy.ts`)
 * runs on the edge runtime, which cannot import `node:crypto`. Keep both: the
 * duplication is forced by the runtime boundary, not gratuitous.
 *
 * Both length and content are folded into a single accumulator, and the loop
 * always runs for `a.length` iterations, so neither a length mismatch nor an
 * early differing character short-circuits it. Timing depends on the length of
 * the first argument alone, never on how many characters matched, so there is
 * no prefix-matching oracle.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    // Past the end of b, charCodeAt returns NaN; `| 0` coerces it to 0 without
    // a branch. A length mismatch is already captured in the seed above.
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}
