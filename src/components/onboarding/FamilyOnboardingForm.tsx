"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CommunicationPreference,
  COMMUNICATION_PREFERENCE_LABELS,
} from "@/types/enums";
import {
  completeFamilyOnboarding,
  type OnboardingResult,
} from "@/lib/family/actions";

interface FamilyOnboardingFormProps {
  defaultEmail: string;
  defaultZip: string;
  defaultPhone: string;
  defaultCommPref: string | null;
}

const initialState: OnboardingResult = {};

export function FamilyOnboardingForm({
  defaultEmail,
  defaultZip,
  defaultPhone,
  defaultCommPref,
}: FamilyOnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    completeFamilyOnboarding,
    initialState,
  );
  const [commPref, setCommPref] = useState<CommunicationPreference | null>(
    (defaultCommPref as CommunicationPreference | null) ?? null,
  );

  const fieldErr = (key: string) => state?.fieldErrors?.[key];

  return (
    <form action={formAction} className="space-y-6">
      {/* Zip code */}
      <div className="space-y-2">
        <Label htmlFor="zip_code">Your zip code</Label>
        <Input
          id="zip_code"
          name="zip_code"
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="11779"
          defaultValue={defaultZip}
          autoFocus
          required
          aria-invalid={fieldErr("zip_code") ? true : undefined}
        />
        <p className="text-soft-black-light text-xs">
          We&apos;ll show nurses within range of this zip.
        </p>
        {fieldErr("zip_code") && (
          <p className="text-destructive text-xs">{fieldErr("zip_code")}</p>
        )}
      </div>

      {/* Communication preference */}
      <div className="space-y-2">
        <Label>How would you like nurses to reach you?</Label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(CommunicationPreference).map((pref) => {
            const selected = commPref === pref;
            return (
              <button
                key={pref}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCommPref(pref)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  selected
                    ? "border-teal bg-teal/5 text-soft-black"
                    : "border-input hover:bg-sage/10",
                )}
              >
                {COMMUNICATION_PREFERENCE_LABELS[pref]}
              </button>
            );
          })}
        </div>
        <input
          type="hidden"
          name="communication_preference"
          value={commPref ?? ""}
        />
        {fieldErr("communication_preference") && (
          <p className="text-destructive text-xs">
            {fieldErr("communication_preference")}
          </p>
        )}
      </div>

      {/* Phone (optional) */}
      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone number{" "}
          <span className="text-soft-black-light font-normal">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="(631) 555-0142"
          defaultValue={defaultPhone}
          aria-invalid={fieldErr("phone") ? true : undefined}
        />
        <p className="text-soft-black-light text-xs">
          {commPref === CommunicationPreference.PHONE ||
          commPref === CommunicationPreference.TEXT
            ? "Add now or later in settings."
            : "Useful if you ever pick Phone or Text contact."}
        </p>
        {fieldErr("phone") && (
          <p className="text-destructive text-xs">{fieldErr("phone")}</p>
        )}
      </div>

      {/* Email confirmation */}
      <div className="border-sage/20 rounded-lg border bg-white p-3">
        <p className="text-soft-black-light text-xs tracking-wide uppercase">
          Account email
        </p>
        <p className="text-soft-black mt-1 text-sm">{defaultEmail}</p>
      </div>

      {/* Disclaimer */}
      <div className="border-sage/30 bg-sage/5 space-y-2 rounded-lg border p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            name="disclaimer_accepted"
            value="on"
            className="mt-0.5"
            required
          />
          <span className="text-soft-black-light leading-relaxed">
            I understand NurseDex verifies each nurse&apos;s license at signup,
            but I&apos;m responsible for my own due diligence (interviews,
            references, background checks) before hiring.
          </span>
        </label>
        {fieldErr("disclaimer_accepted") && (
          <p className="text-destructive text-xs">
            {fieldErr("disclaimer_accepted")}
          </p>
        )}
      </div>

      {state?.formError && (
        <p className="text-destructive text-sm">{state.formError}</p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="bg-teal text-warm-white hover:bg-teal-dark h-11 w-full text-base font-semibold"
      >
        {isPending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
