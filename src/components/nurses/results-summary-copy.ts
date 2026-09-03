import {
  RANKING_CRITERIA,
  DISTANCE_RANKING_CRITERIA,
} from "@/lib/nurses/search-ranking";
import type { SearchResult } from "@/lib/nurses/search";
import {
  SORT_OPTIONS,
  DEFAULT_SORT,
  type SortOption,
} from "@/lib/nurses/search-params";

/**
 * How the order is described to a family, built from the ranking module's own
 * criteria rather than restated beside them.
 *
 * Only the first two, and only the unconditional ones: one criterion applies
 * only to a viewer who has told us how they prefer to be contacted, so a
 * sentence shown to everyone may not claim it.
 *
 * Which order is described depends on whether the family gave a zip we could
 * place. Saying "closest first" to somebody who gave no zip would be a claim
 * about an order that was never used (#723).
 */
export function orderSentence(
  orderedByDistance: boolean,
  sort: SortOption = DEFAULT_SORT,
): string {
  // A sort she chose herself is the order on screen, so the caption names it
  // rather than describing the ranking she is no longer looking at.
  if (sort !== DEFAULT_SORT) {
    const chosen = SORT_OPTIONS.find((o) => o.value === sort);
    if (chosen) return `${chosen.label} first.`;
  }

  const criteria = orderedByDistance
    ? DISTANCE_RANKING_CRITERIA
    : RANKING_CRITERIA;
  const [first, second] = criteria.filter((c) => !c.conditional);
  return `${sentenceCase(first.phrase)} first, then ${second.phrase}.`;
}

function sentenceCase(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export interface ResultsSummaryCopy {
  /** How many full matches, and how many of them are on this page. */
  headline: string;
  /** What the order actually is, or null when there is nothing to order. */
  order: string | null;
  /** The partials, counted and explained separately, or null when there are none. */
  partials: string | null;
}

/**
 * Both numbers in the headline come from ONE predicate: full matches.
 *
 * `totalFull` counts full matches only, while the grid also renders partials.
 * A naive "Showing X of Y" that took X from what is on screen and Y from
 * totalFull can read "Showing 12 of 3" (#777). Partials get their own sentence
 * and their own count instead.
 */
export function resultsSummary(result: SearchResult): ResultsSummaryCopy {
  const total = result.totalFull;
  const shown = result.items.length;
  const partialCount = result.partials.length;

  const headline =
    total === 0
      ? "No nurses match your filters yet."
      : shown === total
        ? `${total} ${nurses(total)} found.`
        : `Showing ${shown} of ${total} ${nurses(total)}.`;

  return {
    headline,
    // The real order, not the mockup's caption. Only worth saying when there
    // is more than one nurse to order.
    order:
      total > 1
        ? orderSentence(result.orderedByDistance, result.sort)
        : null,
    partials:
      partialCount > 0
        ? `Plus ${partialCount} ${nurses(partialCount)} who match some of your filters, below.`
        : null,
  };
}

function nurses(n: number): string {
  return n === 1 ? "nurse" : "nurses";
}
