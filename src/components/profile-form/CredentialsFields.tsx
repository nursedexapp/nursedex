"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckboxGroup } from "./CheckboxGroup";
import { TierLimitBanner } from "./TierLimitBanner";
import { CREDENTIAL_LABELS, CareType, CARE_TYPE_LABELS } from "@/types/enums";
import type { NurseTier } from "@/types/enums";
import { TIER_LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CredentialsFieldsProps {
  values: {
    credential: string;
    license_number: string;
    care_types: string[];
    primary_care_type: string | null;
  };
  tier: NurseTier;
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string | undefined>;
}

const careTypeOptions = Object.entries(CARE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function CredentialsFields({
  values,
  tier,
  onChange,
  errors,
}: CredentialsFieldsProps) {
  const limits = TIER_LIMITS[tier];
  const maxCareTypes =
    limits.maxCareTypes === Infinity ? undefined : limits.maxCareTypes;
  const atCareTypeLimit =
    maxCareTypes !== undefined && values.care_types.length >= maxCareTypes;

  return (
    <>
      {/* Credential type */}
      <div className="space-y-2">
        <Label htmlFor="credential">Credential type</Label>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Credential type"
        >
          {Object.entries(CREDENTIAL_LABELS).map(([value, label]) => {
            const isSelected = values.credential === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange("credential", value)}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-3 py-3 text-center transition-colors",
                  isSelected
                    ? "border-teal bg-teal/5"
                    : "border-input hover:bg-sage/10",
                )}
              >
                <span className="text-sm font-medium">
                  {(value as string).toUpperCase()}
                </span>
                <span className="text-muted-foreground text-xs">{label}</span>
              </button>
            );
          })}
        </div>
        {errors.credential && (
          <p className="text-destructive text-xs">{errors.credential}</p>
        )}
      </div>

      {/* License number */}
      <div className="space-y-2">
        <Label htmlFor="license_number">License number</Label>
        <Input
          id="license_number"
          value={values.license_number}
          onChange={(e) => onChange("license_number", e.target.value)}
          placeholder="Enter your NY State license number"
          aria-invalid={errors.license_number ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">
          Your license number will be displayed on your profile so families can
          verify it.
        </p>
        {errors.license_number && (
          <p className="text-destructive text-xs">{errors.license_number}</p>
        )}
      </div>

      {/* Care types */}
      <div className="space-y-2">
        <Label>
          Care types
          {maxCareTypes && (
            <span className="text-muted-foreground ml-1 font-normal">
              ({values.care_types.length}/{maxCareTypes})
            </span>
          )}
        </Label>
        <CheckboxGroup
          options={careTypeOptions}
          selected={values.care_types}
          onChange={(selected) => {
            onChange("care_types", selected);
            // Clear primary if it's no longer in selected
            if (
              values.primary_care_type &&
              !selected.includes(values.primary_care_type)
            ) {
              onChange("primary_care_type", null);
            }
            // Auto-set primary if only one
            if (selected.length === 1) {
              onChange("primary_care_type", selected[0]);
            }
          }}
          maxCount={maxCareTypes}
        />
        {atCareTypeLimit && tier === "free" && (
          <TierLimitBanner
            message={`Free plan allows up to ${maxCareTypes} care types. Upgrade to Featured for unlimited.`}
          />
        )}
        {errors.care_types && (
          <p className="text-destructive text-xs">{errors.care_types}</p>
        )}
      </div>

      {/* Primary care type (only shown when 2+ selected) */}
      {values.care_types.length > 1 && (
        <div className="space-y-2">
          <Label>Primary care type</Label>
          <p className="text-muted-foreground text-xs">
            This will be highlighted on your profile.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {values.care_types.map((ct) => {
              const label = CARE_TYPE_LABELS[ct as CareType] || ct;
              const isSelected = values.primary_care_type === ct;
              return (
                <button
                  key={ct}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChange("primary_care_type", ct)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    isSelected
                      ? "border-teal bg-teal/5"
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
          {errors.primary_care_type && (
            <p className="text-destructive text-xs">
              {errors.primary_care_type}
            </p>
          )}
        </div>
      )}
    </>
  );
}
