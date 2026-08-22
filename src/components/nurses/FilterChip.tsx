"use client";

import { useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  applied: boolean;
  /** Called when the x is pressed. Only rendered when applied. */
  onClear: () => void;
  /** The popover body. Given a `close` so a single choice control can dismiss. */
  children: (close: () => void) => React.ReactNode;
}

/**
 * One filter, as a chip that opens its own popover (decision D6).
 *
 * An applied chip turns teal, relabels itself with the value, and carries an x
 * to clear. The x is a real button at rest rather than a hover affordance, and
 * it sits outside the trigger so clearing never opens the popover.
 *
 * Focus is restored to the trigger by ref on close rather than left to the
 * popover. A filter change starts a router transition that can remount this
 * chip, and a remounted trigger is not the element the popover captured.
 */
export function FilterChip({
  label,
  applied,
  onClear,
  children,
}: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    // Next frame: the popover is still tearing down on this one.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border text-sm transition-colors",
        applied
          ? "border-teal bg-teal text-white"
          : "border-sage/50 text-soft-black hover:border-sage bg-white",
      )}
    >
      <Popover
        open={open}
        onOpenChange={(next: boolean) => (next ? setOpen(true) : close())}
      >
        <PopoverTrigger
          ref={triggerRef}
          className={cn(
            "focus-visible:ring-teal inline-flex cursor-pointer items-center gap-1 rounded-full py-1.5 pl-3.5 focus-visible:ring-2 focus-visible:outline-none",
            applied ? "pr-1" : "pr-3",
          )}
        >
          {label}
          {!applied && (
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          {children(close)}
        </PopoverContent>
      </Popover>

      {applied && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          // Full white, not 90%: on the teal chip that measures 5.05:1 rather
          // than 4.43:1, which clears the text floor as well as the icon one.
          className="cursor-pointer rounded-full py-1.5 pr-3 pl-1 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
