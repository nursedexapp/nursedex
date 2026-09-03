"use client";

import { Label } from "@/components/ui/label";
import {
  SORT_OPTIONS,
  type SortOption,
} from "@/lib/nurses/search-params";
import { nativeSelectCls } from "./native-select";
import { useApplyFilters } from "./useApplyFilters";

interface SortControlProps {
  /** The order actually in effect, which is what the control must show. */
  value: SortOption;
  /** Whether a zip has been entered, since Closest needs one to measure from. */
  hasZip: boolean;
}

/**
 * Lets a family choose the order, and says which one she is looking at (#725).
 *
 * The choice goes into the URL like every other filter, so a sorted search can
 * be shared and reloaded and paging keeps it. Best match stays the default, so
 * the paid Featured placement is what she sees unless she chooses otherwise.
 *
 * Closest is only offered once a zip is set. Offering it without one would
 * give her a control that silently does nothing, and the page would go on
 * showing a different order with no explanation.
 */
export function SortControl({ value, hasZip }: SortControlProps) {
  const { apply } = useApplyFilters();
  const options = SORT_OPTIONS.filter((o) => !o.needsZip || hasZip);

  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor="results-sort"
        className="text-soft-black-light shrink-0 text-xs"
      >
        Sort by
      </Label>
      <select
        id="results-sort"
        className={`${nativeSelectCls} w-auto`}
        value={value}
        onChange={(e) => {
          const next = e.target.value as SortOption;
          // A change to the order already in effect would push an identical
          // URL and send the page through a server round trip for nothing.
          if (next === value) return;
          apply({ sort: next });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
