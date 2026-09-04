/**
 * Spelling rules for the languages a nurse lists on her profile (#934).
 *
 * The profile form used to uppercase the first character and lowercase the
 * rest, which is right for "spanish" and wrong for every two word language:
 * clicking the form's own "Haitian Creole" suggestion stored "Haitian creole".
 * That was invisible until the directory's language filter started deriving
 * its options from the stored values, at which point the misspelling became
 * what a family reads on the filter row.
 *
 * These live outside the form component on purpose. The client normalises so
 * the nurse sees what will be stored, and the profile schema normalises again
 * on the way in, so a write that never went through the form cannot store a
 * spelling the filter will then show.
 */

/**
 * Title case one language: every word, and every hyphen separated part of a
 * word, but not after an apostrophe, which would give "K'Iche'".
 */
export function normalizeLanguage(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (!collapsed) return "";

  return collapsed
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
        )
        .join("-"),
    )
    .join(" ");
}

/**
 * Normalise a whole list, dropping empties and any spelling that collapses
 * onto one already in the list. Deduplicating on the NORMALISED form matters:
 * "Haitian creole" and "haitian Creole" are one language, and storing both
 * puts two counted options on the filter row for the same thing.
 */
export function normalizeLanguageList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const normalized = normalizeLanguage(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}
