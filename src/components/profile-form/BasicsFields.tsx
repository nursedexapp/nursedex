"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageInput } from "./LanguageInput";
import { GENDER_LABELS } from "@/types/enums";
import { cn } from "@/lib/utils";

interface BasicsFieldsProps {
  values: {
    first_name: string;
    last_name: string;
    gender: string;
    years_experience: number | "";
    languages: string[];
  };
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string | undefined>;
}

export function BasicsFields({ values, onChange, errors }: BasicsFieldsProps) {
  return (
    <>
      {/* Name */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            value={values.first_name}
            onChange={(e) => onChange("first_name", e.target.value)}
            placeholder="e.g., Jane"
            aria-invalid={errors.first_name ? true : undefined}
          />
          {errors.first_name && (
            <p className="text-destructive text-xs">{errors.first_name}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            value={values.last_name}
            onChange={(e) => onChange("last_name", e.target.value)}
            placeholder="e.g., Doe"
            aria-invalid={errors.last_name ? true : undefined}
          />
          {errors.last_name && (
            <p className="text-destructive text-xs">{errors.last_name}</p>
          )}
        </div>
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <Label>Gender</Label>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Gender"
        >
          {Object.entries(GENDER_LABELS).map(([value, label]) => {
            const isSelected = values.gender === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange("gender", value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  isSelected
                    ? "border-teal bg-teal/5 text-foreground"
                    : "border-input hover:bg-sage/10",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-teal bg-teal"
                      : "border-muted-foreground/40",
                  )}
                >
                  {isSelected && (
                    <span className="size-2 rounded-full bg-white" />
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        {errors.gender && (
          <p className="text-destructive text-xs">{errors.gender}</p>
        )}
      </div>

      {/* Years of experience */}
      <div className="space-y-2">
        <Label htmlFor="years_experience">Years of experience</Label>
        <Input
          id="years_experience"
          type="number"
          min={0}
          max={70}
          value={values.years_experience}
          onChange={(e) => {
            const val = e.target.value;
            onChange("years_experience", val === "" ? "" : parseInt(val, 10));
          }}
          placeholder="e.g., 5"
          className="w-32"
          aria-invalid={errors.years_experience ? true : undefined}
        />
        {errors.years_experience && (
          <p className="text-destructive text-xs">{errors.years_experience}</p>
        )}
      </div>

      {/* Languages */}
      <div className="space-y-2">
        <Label>Languages spoken</Label>
        <LanguageInput
          value={values.languages}
          onChange={(langs) => onChange("languages", langs)}
          error={errors.languages}
        />
        {errors.languages && (
          <p className="text-destructive text-xs">{errors.languages}</p>
        )}
      </div>
    </>
  );
}
