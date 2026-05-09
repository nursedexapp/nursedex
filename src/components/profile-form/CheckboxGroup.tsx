"use client";

import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";

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

        // Each card is a single button-like control. Earlier the inner
        // checkbox used base-ui's primitive, which renders as a button
        // and didn't forward clicks from a wrapping <label>. The next
        // attempt used pointer-events-none on the primitive, but the
        // primitive's hit-area pseudo-elements still intercepted some
        // clicks. Easiest reliable fix: render a plain visual indicator
        // here and let the wrapping button own all interaction.
        return (
          <button
            key={value}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-disabled={isDisabled && !isSelected}
            disabled={isDisabled && !isSelected}
            onClick={handleActivate}
            className={cn(
              "focus-visible:ring-teal flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              isSelected
                ? "border-teal bg-teal/5"
                : "border-input hover:bg-sage/10",
              isDisabled && !isSelected && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                isSelected
                  ? "bg-teal border-teal text-warm-white"
                  : "border-input bg-transparent",
              )}
            >
              {isSelected && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="flex-1">{label}</span>
            {isDisabled && !isSelected && (
              <Lock
                aria-hidden="true"
                className="text-muted-foreground size-3.5"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
