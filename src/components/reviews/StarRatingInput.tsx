"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}

export function StarRatingInput({
  value,
  onChange,
  disabled,
}: StarRatingInputProps) {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div
      role="radiogroup"
      aria-label="Star rating"
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            className={cn(
              "rounded p-1 transition-colors",
              "focus-visible:ring-teal focus-visible:ring-2 focus-visible:outline-none",
              disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-amber-50",
            )}
          >
            <Star
              className={cn(
                "size-7",
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
