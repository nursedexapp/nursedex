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
}

export function FilterSheet({ initialFilters }: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="border-sage/30 text-soft-black hover:bg-sage/10 focus-visible:ring-teal inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Open filters"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filters
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
