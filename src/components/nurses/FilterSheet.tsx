"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterPanel } from "./FilterPanel";
import type { SearchFilters } from "@/lib/nurses/search-params";
import type { DirectoryFacets } from "@/lib/nurses/facets";

interface FilterSheetProps {
  initialFilters: SearchFilters;
  /** The directory's own filter options, passed straight to the panel (#766). */
  facets: DirectoryFacets | null;
  /**
   * What opens the sheet. The chip row passes its own "More filters" pill so
   * the row reads as one control surface; without it the sheet renders the
   * standalone Filters button the phone layout uses.
   */
  trigger?: React.ReactNode;
}

export function FilterSheet({
  initialFilters,
  facets,
  trigger,
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="focus-visible:ring-teal cursor-pointer rounded-full focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Open more filters"
      >
        {trigger ?? (
          <span className="border-sage/30 text-soft-black hover:bg-sage/10 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 pt-2 pb-6">
          {/* The sheet covers the results on a phone, so leaving it open
              after a filter is applied means the visitor has to dismiss it by
              hand to see what her choice did (#779). Clearing everything
              closes it too: the results behind have changed just as much. */}
          <FilterPanel
            initialFilters={initialFilters}
            facets={facets}
            onAfterChange={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
