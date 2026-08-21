"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  parseSearchParams,
  toURLSearchParams,
  type SearchFilters,
} from "@/lib/nurses/search-params";

/**
 * Apply a filter change on top of whatever the URL says AT THE MOMENT OF THE
 * CLICK.
 *
 * The old panel merged over `initialFilters`, a prop from the last completed
 * server render, and relied on one line disabling the whole panel while a
 * router transition was in flight to stop a second change landing on stale
 * state. Seven independent popovers have no such shared guard, so the merge
 * has to be correct rather than serialised: a second change made before the
 * first transition resolves must build on the first, not revert it (#775).
 *
 * `window.location.search` is the live value. A `useSearchParams()` closure
 * would be the value as of this render, which is the same staleness in a
 * different wrapper.
 */
export function useApplyFilters(): {
  apply: (next: Partial<SearchFilters>) => void;
  clearAll: () => void;
  currentFilters: () => SearchFilters;
} {
  const router = useRouter();

  const currentFilters = useCallback((): SearchFilters => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    return parseSearchParams(new URLSearchParams(search));
  }, []);

  const apply = useCallback(
    (next: Partial<SearchFilters>) => {
      // Page always resets: the new result set is a different size, so the
      // page number the family was on rarely still exists.
      const merged: Partial<SearchFilters> = {
        ...currentFilters(),
        ...next,
        page: 1,
      };
      const query = toURLSearchParams(merged).toString();
      router.replace(query ? `/nurses?${query}` : "/nurses", { scroll: false });
    },
    [router, currentFilters],
  );

  const clearAll = useCallback(() => {
    router.replace("/nurses", { scroll: false });
  }, [router]);

  return { apply, clearAll, currentFilters };
}
