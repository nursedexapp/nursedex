import type { DirectoryFacets, FacetOption } from "./facets";
import { facetLabel } from "./facet-labels";
import type { SearchFilters } from "./search-params";

/**
 * The applied filter with the fewest nurses behind it, so an empty results
 * page can offer to drop it (#766).
 *
 * No single filter is a dead end any more, but a family who applies several
 * at once can still reach zero. #766 accepts that on condition the empty
 * state names a way out, and the counts make the right one computable: the
 * rarest thing she asked for is the likeliest reason nobody matched.
 *
 * Only the filters that carry counts can be ranked. A zip, a distance, a rate
 * or a minimum experience has no option list behind it, so when those are all
 * that is applied there is nothing to name and the caller keeps its ordinary
 * "clear filters" wording.
 */

export interface NarrowestFilter {
  /** What to call it on screen, in the family's words. */
  label: string;
  /** The change that removes it, ready to merge over the current filters. */
  patch: Partial<SearchFilters>;
}

/** An applied option that came from a counted facet. */
interface Candidate {
  count: number;
  label: string;
  patch: Partial<SearchFilters>;
}

const countOf = (options: FacetOption[], value: string): number =>
  // Not being in the facet list at all means nobody is behind it, which makes
  // it the narrowest thing applied rather than an unrankable one.
  options.find((o) => o.value === value)?.count ?? 0;

export function narrowestAppliedFilter(
  filters: SearchFilters,
  facets: DirectoryFacets | null,
): NarrowestFilter | null {
  if (!facets) return null;

  const candidates: Candidate[] = [];

  const scalar = <K extends "credential" | "care_type">(
    key: K,
    facet: keyof DirectoryFacets,
    options: FacetOption[],
  ) => {
    const value = filters[key];
    if (!value) return;
    candidates.push({
      count: countOf(options, value),
      label: facetLabel(String(facet), value),
      patch: { [key]: undefined } as Partial<SearchFilters>,
    });
  };

  scalar("credential", "credential", facets.credential);
  scalar("care_type", "care_types", facets.care_types);

  if (filters.gender && filters.gender !== "any") {
    candidates.push({
      count: countOf(facets.gender, filters.gender),
      label: facetLabel("gender", filters.gender),
      patch: { gender: "any" } as Partial<SearchFilters>,
    });
  }

  const list = <K extends "skills" | "languages" | "availability_commitment" | "time_slots">(
    key: K,
    facet: string,
    options: FacetOption[],
  ) => {
    for (const value of filters[key] as string[]) {
      candidates.push({
        count: countOf(options, value),
        label: facetLabel(facet, value),
        // Only this value goes: the rest of what she chose stays.
        patch: {
          [key]: (filters[key] as string[]).filter((v) => v !== value),
        } as Partial<SearchFilters>,
      });
    }
  };

  list("skills", "skills", facets.skills);
  list("languages", "languages", facets.languages);
  list(
    "availability_commitment",
    "availability_commitment",
    facets.availability_commitment,
  );
  list("time_slots", "time_slots", facets.time_slots);

  // One counted filter on its own is the whole search: offering to drop it is
  // the same as clearing everything, which the empty state already offers.
  if (candidates.length < 2) return null;

  const narrowest = candidates.reduce((a, b) => (b.count < a.count ? b : a));

  return {
    label: narrowest.label,
    // Back to the first page: the page she was on belongs to the old result
    // set and would land her on an empty one again.
    patch: { ...narrowest.patch, page: 1 },
  };
}
