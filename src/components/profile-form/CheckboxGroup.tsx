"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface CheckboxGroupProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  maxCount?: number;
  columns?: 2 | 3;
  disabled?: boolean;
}

export function CheckboxGroup({
  options,
  selected,
  onChange,
  maxCount,
  columns = 2,
  disabled = false,
}: CheckboxGroupProps) {
  const atLimit = maxCount !== undefined && selected.length >= maxCount;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else if (!atLimit) {
      onChange([...selected, value]);
    }
  };

  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {options.map(({ value, label }) => {
        const isSelected = selected.includes(value);
        const isDisabled = disabled || (atLimit && !isSelected);

        const handleActivate = () => {
          if (!isDisabled || isSelected) toggle(value);
        };

        // Whole card is the interactive surface. base-ui's Checkbox.Root
        // doesn't get clicks forwarded from a wrapping native <label>
        // (it's a button-like element, not a labelable form control), so
        // we drive selection from this outer div via role="checkbox" with
        // explicit click + keyboard handlers. The inner Checkbox is just
        // visual feedback.
        return (
          <div
            key={value}
            role="checkbox"
            aria-checked={isSelected}
            aria-disabled={isDisabled && !isSelected}
            tabIndex={isDisabled && !isSelected ? -1 : 0}
            onClick={handleActivate}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                handleActivate();
              }
            }}
            className={cn(
              "focus-visible:ring-teal flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              isSelected
                ? "border-teal bg-teal/5"
                : "border-input hover:bg-sage/10",
              isDisabled && !isSelected && "cursor-not-allowed opacity-50",
            )}
          >
            <Checkbox
              checked={isSelected}
              tabIndex={-1}
              aria-hidden={true}
              className="pointer-events-none"
            />
            <span className="flex-1">{label}</span>
            {isDisabled && !isSelected && (
              <Lock className="text-muted-foreground size-3.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}
