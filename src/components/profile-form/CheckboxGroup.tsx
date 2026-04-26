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

        return (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
              isSelected
                ? "border-teal bg-teal/5"
                : "border-input hover:bg-sage/10",
              isDisabled && !isSelected && "cursor-not-allowed opacity-50",
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {
                if (!isDisabled || isSelected) toggle(value);
              }}
              disabled={isDisabled && !isSelected}
            />
            <span className="flex-1">{label}</span>
            {isDisabled && !isSelected && (
              <Lock className="text-muted-foreground size-3.5" />
            )}
          </label>
        );
      })}
    </div>
  );
}
