import filter from "leo-profanity";

let warmed = false;

/**
 * Lazy initialization. leo-profanity loads its English dictionary on
 * first use. We call it explicitly so the first request doesn't pay the
 * cold-start cost twice.
 */
function ensureDictionary(): void {
  if (warmed) return;
  filter.loadDictionary("en");
  warmed = true;
}

/**
 * Returns true when the text contains a blocked word from the default
 * English dictionary. Word-boundary matched (so "assistance" /
 * "compassion" are clean even though they contain a flagged substring).
 *
 * Note: the library does not catch obfuscated profanity ("f**k",
 * "f.u.c.k", etc). That's an acceptable trade for v1: we want false
 * negatives, not false positives, on a population of medical workers.
 */
export function containsProfanity(text: string): boolean {
  ensureDictionary();
  return filter.check(text);
}
