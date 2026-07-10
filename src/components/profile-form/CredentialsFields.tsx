"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckboxGroup } from "./CheckboxGroup";
import { TierLimitBanner } from "./TierLimitBanner";
import {
  CREDENTIAL_LABELS,
  CareType,
  CARE_TYPE_LABELS,
  Credential,
} from "@/types/enums";
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

  // HHAs don't carry a license or certification number, so the field is
  // optional for them. CNAs hold a certification number; everyone else a
  // license number.
  const isHHA = values.credential === Credential.HHA;
  const credentialNumberLabel =
    values.credential === Credential.CNA
      ? "Certification number"
      : isHHA
        ? "License or certification number"
        : values.credential
          ? "License number"
          : "License or certification number";

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

      {/* License/certification number, emphasized because incorrect numbers
          will fail verification, which is one of the few places this wizard
          can fail in a way that's annoying to recover from. Optional for HHAs,
          who don't carry a number. */}
      <div className="border-warning/30 bg-warning/5 space-y-2 rounded-lg border-l-4 p-4">
        <Label
          htmlFor="license_number"
          className="text-soft-black text-sm font-semibold"
        >
          {credentialNumberLabel}
          {isHHA && (
            <span className="text-muted-foreground ml-1 font-normal">
              (optional)
            </span>
          )}
        </Label>
        <p className="text-soft-black-light text-xs">
          {isHHA
            ? "Home Health Aides don't have a license or certification number, so this is optional. If you have one, adding it helps families verify you."
            : "Please double check this. We check it against New York State records, and a typo will hold up your profile going live."}
        </p>
        <Input
          id="license_number"
          value={values.license_number}
          onChange={(e) => onChange("license_number", e.target.value)}
          placeholder={
            isHHA
              ? "Optional for Home Health Aides"
              : "Your NY State license or certification number"
          }
          aria-invalid={errors.license_number ? true : undefined}
          className="bg-warm-white"
        />
        <p className="text-muted-foreground text-xs">
          If you add one, it will appear on your profile so families can verify
          it themselves.
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
            message={`Free plan allows up to ${maxCareTypes} care types.`}
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
