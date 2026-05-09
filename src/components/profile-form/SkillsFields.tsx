"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxGroup } from "./CheckboxGroup";
import {
  SKILL_LABELS,
  AVAILABILITY_COMMITMENT_LABELS,
  TIME_SLOT_LABELS,
} from "@/types/enums";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SkillsFieldsProps {
  values: {
    skills: string[];
    availability_commitment: string[];
    time_slots: string[];
    rate_min: number | "" | null;
    rate_max: number | "" | null;
    has_transportation: boolean;
    covid_vaccinated: boolean | null;
    care_philosophy: string;
    additional_certs: string[];
  };
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string | undefined>;
}

const skillOptions = Object.entries(SKILL_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const availabilityOptions = Object.entries(AVAILABILITY_COMMITMENT_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// Flexible is intentionally hidden from the wizard. Selecting all the named
// slots already communicates "available anytime", and offering both made
// users wonder what the difference was. The DB enum still has the value so
// existing rows that contain it keep working; new profiles just can't pick
// it.
const timeSlotOptions = Object.entries(TIME_SLOT_LABELS)
  .filter(([value]) => value !== "flexible")
  .map(([value, label]) => ({ value, label }));

export function SkillsFields({ values, onChange, errors }: SkillsFieldsProps) {
  const [certInput, setCertInput] = useState("");

  const addCert = () => {
    const trimmed = certInput.trim();
    if (trimmed && !values.additional_certs.includes(trimmed)) {
      onChange("additional_certs", [...values.additional_certs, trimmed]);
    }
    setCertInput("");
  };

  const removeCert = (cert: string) => {
    onChange(
      "additional_certs",
      values.additional_certs.filter((c) => c !== cert),
    );
  };

  return (
    <>
      {/* Skills */}
      <div className="space-y-2">
        <Label>Skills and experience</Label>
        <p className="text-muted-foreground text-xs">
          Select all that apply. These help families find the right match.
        </p>
        <CheckboxGroup
          options={skillOptions}
          selected={values.skills}
          onChange={(selected) => onChange("skills", selected)}
          columns={2}
        />
        {errors.skills && (
          <p className="text-destructive text-xs">{errors.skills}</p>
        )}
      </div>

      {/* Availability commitment */}
      <div className="space-y-2">
        <Label>Availability</Label>
        <CheckboxGroup
          options={availabilityOptions}
          selected={values.availability_commitment}
          onChange={(selected) => onChange("availability_commitment", selected)}
          columns={2}
        />
        {errors.availability_commitment && (
          <p className="text-destructive text-xs">
            {errors.availability_commitment}
          </p>
        )}
      </div>

      {/* Time slots */}
      <div className="space-y-2">
        <Label>Preferred time slots</Label>
        <CheckboxGroup
          options={timeSlotOptions}
          selected={values.time_slots}
          onChange={(selected) => onChange("time_slots", selected)}
          columns={3}
        />
        {errors.time_slots && (
          <p className="text-destructive text-xs">{errors.time_slots}</p>
        )}
      </div>

      {/* Hourly rate range */}
      <div className="space-y-2">
        <Label>Hourly rate range (optional)</Label>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
              $
            </span>
            <Input
              type="number"
              min={0}
              value={values.rate_min ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onChange("rate_min", val === "" ? null : parseFloat(val));
              }}
              placeholder="Min"
              className="w-28 pl-6"
              aria-label="Minimum hourly rate"
            />
          </div>
          <span className="text-muted-foreground text-sm">to</span>
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
              $
            </span>
            <Input
              type="number"
              min={0}
              value={values.rate_max ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onChange("rate_max", val === "" ? null : parseFloat(val));
              }}
              placeholder="Max"
              className="w-28 pl-6"
              aria-label="Maximum hourly rate"
            />
          </div>
          <span className="text-muted-foreground text-sm">/hr</span>
        </div>
        {errors.rate_min && (
          <p className="text-destructive text-xs">{errors.rate_min}</p>
        )}
        {errors.rate_max && (
          <p className="text-destructive text-xs">{errors.rate_max}</p>
        )}
      </div>

      {/* Transportation */}
      <div className="space-y-2">
        <Label>Do you have your own transportation?</Label>
        <div className="flex gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ].map(({ value, label }) => {
            const isSelected = values.has_transportation === value;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange("has_transportation", value)}
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
      </div>

      {/* COVID vaccination */}
      <div className="space-y-2">
        <Label>COVID vaccination status (optional)</Label>
        <div className="flex gap-2">
          {[
            { value: true, label: "Vaccinated" },
            { value: false, label: "Not vaccinated" },
            { value: null, label: "Prefer not to say" },
          ].map(({ value, label }) => {
            const isSelected = values.covid_vaccinated === value;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange("covid_vaccinated", value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
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
      </div>

      {/* Care philosophy */}
      <div className="space-y-2">
        <Label htmlFor="care_philosophy">Care philosophy (optional)</Label>
        <p className="text-muted-foreground text-xs">
          What drives your approach to care? Families love hearing this.
        </p>
        <Textarea
          id="care_philosophy"
          value={values.care_philosophy}
          onChange={(e) => onChange("care_philosophy", e.target.value)}
          placeholder="I believe in treating every patient with the same warmth and respect I would want for my own family..."
          rows={3}
          maxLength={500}
        />
        <p className="text-muted-foreground text-right text-xs">
          {values.care_philosophy.length}/500
        </p>
        {errors.care_philosophy && (
          <p className="text-destructive text-xs">{errors.care_philosophy}</p>
        )}
      </div>

      {/* Additional certifications */}
      <div className="space-y-2">
        <Label>Additional certifications (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          {values.additional_certs.map((cert) => (
            <Badge
              key={cert}
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-sm"
            >
              {cert}
              <button
                type="button"
                onClick={() => removeCert(cert)}
                className="hover:bg-foreground/10 ml-0.5 rounded-full p-0.5"
              >
                <X className="size-3" />
                <span className="sr-only">Remove {cert}</span>
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCert();
              }
            }}
            placeholder="e.g. BLS, ACLS, Wound Care Certified"
          />
          <Button type="button" variant="outline" onClick={addCert}>
            Add
          </Button>
        </div>
      </div>
    </>
  );
}
