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

interface FilterSheetProps {
  initialFilters: SearchFilters;
  /**
   * What opens the sheet. The chip row passes its own "More filters" pill so
   * the row reads as one control surface; without it the sheet renders the
   * standalone Filters button the phone layout uses.
   */
  trigger?: React.ReactNode;
}

export function FilterSheet({ initialFilters, trigger }: FilterSheetProps) {
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
          <FilterPanel initialFilters={initialFilters} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
