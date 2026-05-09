"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommunicationPreference } from "@/types/enums";
import { cn } from "@/lib/utils";

const COMM_OPTIONS = [
  { value: CommunicationPreference.EMAIL, label: "Email" },
  { value: CommunicationPreference.PHONE, label: "Phone call" },
  { value: CommunicationPreference.TEXT, label: "Text message" },
];

interface ContactFieldsProps {
  values: {
    contact_email: string;
    contact_phone: string;
    communication_preference: string;
    zip_code: string;
    travel_radius_miles: number | "";
  };
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string | undefined>;
}

export function ContactFields({
  values,
  onChange,
  errors,
}: ContactFieldsProps) {
  return (
    <>
      {/* Contact email */}
      <div className="space-y-2">
        <Label htmlFor="contact_email">Contact email</Label>
        <Input
          id="contact_email"
          type="email"
          value={values.contact_email}
          onChange={(e) => onChange("contact_email", e.target.value)}
          placeholder="jane@example.com"
          aria-invalid={errors.contact_email ? true : undefined}
        />
        {errors.contact_email && (
          <p className="text-destructive text-xs">{errors.contact_email}</p>
        )}
      </div>

      {/* Contact phone */}
      <div className="space-y-2">
        <Label htmlFor="contact_phone">Contact phone</Label>
        <Input
          id="contact_phone"
          type="tel"
          value={values.contact_phone}
          onChange={(e) => onChange("contact_phone", e.target.value)}
          placeholder="(631) 555-0123"
          aria-invalid={errors.contact_phone ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">
          Provide at least an email or phone number (or both).
        </p>
        {errors.contact_phone && (
          <p className="text-destructive text-xs">{errors.contact_phone}</p>
        )}
      </div>

      {/* Communication preference */}
      <div className="space-y-2">
        <Label>How do you prefer families to reach you?</Label>
        <div className="flex flex-wrap gap-2">
          {COMM_OPTIONS.map(({ value, label }) => {
            const isSelected = values.communication_preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange("communication_preference", value)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm transition-colors",
                  isSelected
                    ? "border-teal bg-teal/5"
                    : "border-input hover:bg-sage/10",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {errors.communication_preference && (
          <p className="text-destructive text-xs">
            {errors.communication_preference}
          </p>
        )}
      </div>

      {/* Zip code */}
      <div className="space-y-2">
        <Label htmlFor="zip_code">Your zip code</Label>
        <Input
          id="zip_code"
          value={values.zip_code}
          onChange={(e) => {
            // Only allow digits, max 5
            const val = e.target.value.replace(/\D/g, "").slice(0, 5);
            onChange("zip_code", val);
          }}
          placeholder="e.g., 11701"
          className="w-32"
          maxLength={5}
          aria-invalid={errors.zip_code ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">
          Your zip code is never shown to families. It is only used to calculate
          distance.
        </p>
        {errors.zip_code && (
          <p className="text-destructive text-xs">{errors.zip_code}</p>
        )}
      </div>

      {/* Travel radius */}
      <div className="space-y-2">
        <Label htmlFor="travel_radius_miles">
          How far are you willing to travel?
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="travel_radius_miles"
            type="text"
            inputMode="numeric"
            value={values.travel_radius_miles}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9]/g, "");
              onChange(
                "travel_radius_miles",
                cleaned === "" ? "" : parseInt(cleaned, 10),
              );
            }}
            placeholder="e.g., 25"
            className="w-24"
            aria-invalid={errors.travel_radius_miles ? true : undefined}
          />
          <span className="text-muted-foreground text-sm">miles</span>
        </div>
        {errors.travel_radius_miles && (
          <p className="text-destructive text-xs">
            {errors.travel_radius_miles}
          </p>
        )}
      </div>
    </>
  );
}
