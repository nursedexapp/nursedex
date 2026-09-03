/**
 * The free text half of the directory search (#729).
 *
 * A family who was given a nurse's name, or who wants somebody whose bio
 * mentions dementia or ventilator care, had no way to type it: every control
 * was structured. This turns what she typed into one pattern the query can
 * carry, and refuses the ones that would silently match everybody.
 */

/** Longer than anybody searches a directory with, and short enough to log. */
export const KEYWORD_MAX_LENGTH = 60;

/**
 * What PostgREST would otherwise read as pattern syntax rather than as text.
 *
 * `*` is its own wildcard, `%` and `_` are SQL LIKE's and pass straight
 * through, and `\` is LIKE's escape. A family typing "100%" means the
 * characters, so they are removed rather than escaped: PostgREST has no way
 * to send a LIKE ESCAPE clause, and a half escaped pattern is worse than a
 * plainer search.
 */
const PATTERN_CHARACTERS = /[%_*\\]/g;

/**
 * The `ilike` pattern for a keyword, or null when there is nothing to search
 * for.
 *
 * Null is the important case: a keyword of only wildcards would collapse to
 * "**", which matches every nurse in the directory and reads to the family as
 * though her search had been ignored rather than refused.
 */
export function keywordPattern(raw: string): string | null {
  const cleaned = raw
    .replace(PATTERN_CHARACTERS, "")
    .trim()
    .slice(0, KEYWORD_MAX_LENGTH);

  if (cleaned.length === 0) return null;

  return `*${cleaned}*`;
}

/**
 * Whether a nurse's name matches what the family typed.
 *
 * Done here rather than in the query for two reasons, both measured against
 * the live API on 2026-09-03. PostgREST cannot put a filter on an embedded
 * table inside a top-level `or`: `or=(bio.ilike.*x*,users.first_name.ilike.*x*)`
 * is a 400, "failed to parse logic tree". And names are small, so reading
 * every listed nurse's name costs almost nothing, while reading every bio to
 * match in the same way would not.
 *
 * The last name is searchable only by a viewer who is already shown it.
 * Cards strip it for anyone without a subscription (#381), and a keyword that
 * matched it would hand the same fact back by guessing: a hit confirms a
 * spelling she was never shown.
 */
export function matchesNurseName(
  nurse: { first_name: string | null; last_name: string | null },
  keyword: string,
  gate: { canSeeIdentity: boolean },
): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle.length === 0) return false;

  const fields = gate.canSeeIdentity
    ? [nurse.first_name, nurse.last_name]
    : [nurse.first_name];

  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}
