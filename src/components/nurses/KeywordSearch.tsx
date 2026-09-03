"use client";

import { Search, X } from "lucide-react";
import { DebouncedFilterInput } from "./DebouncedFilterInput";
import { useApplyFilters } from "./useApplyFilters";
import type { SearchFilters } from "@/lib/nurses/search-params";

/**
 * The free text box above the filter row (#729).
 *
 * Structured filters cannot express "the nurse my neighbour recommended, I
 * think her name was Marisol", or "somebody whose bio mentions ventilator
 * care", which is how people actually arrive at a directory.
 *
 * It commits after a pause rather than on every keystroke, for the reason
 * DebouncedFilterInput exists: a router transition per keystroke re-renders
 * the field from the stale URL and eats what was typed.
 */
export function KeywordSearch({ filters }: { filters: SearchFilters }) {
  const { apply } = useApplyFilters();
  const current = filters.q ?? "";

  return (
    <div className="relative">
      <label htmlFor="nurse-keyword" className="sr-only">
        Search by name or what a nurse has written
      </label>
      <Search
        className="text-soft-black-light pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <DebouncedFilterInput
        id="nurse-keyword"
        type="search"
        className="pr-10 pl-9"
        placeholder="Search by name, or a word from a nurse's profile"
        value={current}
        onCommit={(raw) => apply({ q: raw.trim() || undefined })}
      />
      {current.length > 0 && (
        // A control at rest, not on hover: the same rule the chip clears
        // follow, so it is reachable by touch and by keyboard.
        <button
          type="button"
          onClick={() => apply({ q: undefined })}
          aria-label="Clear search"
          className="text-soft-black-light hover:text-soft-black focus-visible:ring-teal absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-full p-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
