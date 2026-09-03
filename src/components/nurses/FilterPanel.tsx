"use client";

import { useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DebouncedFilterInput, parseFilterInt } from "./DebouncedFilterInput";
import { useApplyFilters } from "./useApplyFilters";
import { nativeSelectCls } from "./native-select";
import {
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
  SKILL_LABELS,
  GENDER_LABELS,
  AVAILABILITY_COMMITMENT_LABELS,
  TIME_SLOT_LABELS,
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";
import {
  GENDER_FILTER_ANY,
  type SearchFilters,
  type GenderFilter,
} from "@/lib/nurses/search-params";

const DISTANCE_OPTIONS = [5, 10, 25, 50, 100] as const;
const FILTER_LANGUAGES = [
  "English",
  "Spanish",
  "Italian",
  "Mandarin",
  "Russian",
  "Haitian Creole",
  "Polish",
  "Portuguese",
];

interface FilterPanelProps {
  initialFilters: SearchFilters;
  // Called after each URL change. Used by the mobile sheet to auto-close.
  onAfterChange?: () => void;
}


export function FilterPanel({
  initialFilters,
  onAfterChange,
}: FilterPanelProps) {
  const [isPending, startTransition] = useTransition();
  const { apply: applyToUrl, clearAll: clearAllInUrl } = useApplyFilters();

  // Merges over the URL as it stands at the moment of the click, not over
  // initialFilters, which is a prop from the last completed server render.
  // The panel is no longer disabled while a transition is in flight, so a
  // second change made before the first resolves has to build on it (#775).
  const apply = (next: Partial<SearchFilters>) => {
    startTransition(() => {
      applyToUrl(next);
      onAfterChange?.();
    });
  };

  const clearAll = () => {
    startTransition(() => {
      clearAllInUrl();
      onAfterChange?.();
    });
  };

  const toggleArray = <T extends string>(current: T[], value: T): T[] =>
    current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];

  return (
    <div className={cn("space-y-6 text-sm", isPending && "opacity-70")}>
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-soft-black text-base font-medium">
          Filters
        </h2>
        <button
          type="button"
          onClick={clearAll}
          className="text-soft-black-light cursor-pointer text-xs underline-offset-4 hover:underline"
        >
          Clear all
        </button>
      </div>

      {/* Credential */}
      <FilterSection label="Credential">
        <select
          className={nativeSelectCls}
          value={initialFilters.credential ?? ""}
          onChange={(e) =>
            apply({
              credential: e.target.value
                ? (e.target.value as Credential)
                : undefined,
            })
          }
        >
          <option value="">Any credential</option>
          {Object.values(Credential).map((c) => (
            <option key={c} value={c}>
              {CREDENTIAL_LABELS[c]}
            </option>
          ))}
        </select>
      </FilterSection>

      {/* Care type */}
      <FilterSection label="Care type">
        <select
          className={nativeSelectCls}
          value={initialFilters.care_type ?? ""}
          onChange={(e) =>
            apply({
              care_type: e.target.value
                ? (e.target.value as CareType)
                : undefined,
            })
          }
        >
          <option value="">Any care type</option>
          {Object.values(CareType).map((c) => (
            <option key={c} value={c}>
              {CARE_TYPE_LABELS[c]}
            </option>
          ))}
        </select>
      </FilterSection>

      {/* Skills */}
      <FilterSection label="Skills">
        <div className="grid gap-1.5">
          {Object.values(Skill).map((s) => {
            const checked = initialFilters.skills.includes(s);
            return (
              <label
                key={s}
                className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    apply({ skills: toggleArray(initialFilters.skills, s) })
                  }
                />
                {SKILL_LABELS[s]}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Languages */}
      <FilterSection label="Languages">
        <div className="grid gap-1.5">
          {FILTER_LANGUAGES.map((lang) => {
            const checked = initialFilters.languages.includes(lang);
            return (
              <label
                key={lang}
                className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    apply({
                      languages: toggleArray(initialFilters.languages, lang),
                    })
                  }
                />
                {lang}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Gender */}
      <FilterSection label="Gender">
        <select
          className={nativeSelectCls}
          value={initialFilters.gender}
          onChange={(e) => apply({ gender: e.target.value as GenderFilter })}
        >
          <option value={GENDER_FILTER_ANY}>Any</option>
          {Object.values(Gender)
            .filter((g) => g !== Gender.PREFER_NOT_TO_SAY)
            .map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
        </select>
      </FilterSection>

      {/* Rate max */}
      <FilterSection label="Max hourly rate ($)">
        <DebouncedFilterInput
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={
            initialFilters.rate_max !== undefined
              ? String(initialFilters.rate_max)
              : ""
          }
          placeholder="e.g. 40"
          onCommit={(raw) => apply({ rate_max: parseFilterInt(raw) })}
        />
      </FilterSection>

      {/* Experience min */}
      <FilterSection label="Min years of experience">
        <DebouncedFilterInput
          type="number"
          inputMode="numeric"
          min={0}
          max={70}
          step={1}
          value={
            initialFilters.experience_min !== undefined
              ? String(initialFilters.experience_min)
              : ""
          }
          placeholder="e.g. 5"
          onCommit={(raw) => apply({ experience_min: parseFilterInt(raw) })}
        />
      </FilterSection>

      {/* Location */}
      <FilterSection label="Location">
        <div className="space-y-2">
          <div>
            <Label
              htmlFor="filter-zip"
              className="text-soft-black-light text-xs"
            >
              Your zip code
            </Label>
            <DebouncedFilterInput
              id="filter-zip"
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="11779"
              value={initialFilters.zip ?? ""}
              sanitize={(raw) => raw.replace(/\D/g, "").slice(0, 5)}
              onCommit={(raw) =>
                apply({ zip: raw.length === 5 ? raw : undefined })
              }
              renderHint={(text) =>
                text.length > 0 && text.length < 5
                  ? "Enter all 5 digits to filter by distance."
                  : null
              }
            />
          </div>
          <div>
            <Label
              htmlFor="filter-distance"
              className="text-soft-black-light text-xs"
            >
              Within
            </Label>
            <select
              id="filter-distance"
              className={nativeSelectCls}
              value={
                initialFilters.distance !== undefined
                  ? String(initialFilters.distance)
                  : ""
              }
              onChange={(e) =>
                apply({
                  distance: e.target.value
                    ? Number.parseInt(e.target.value, 10)
                    : undefined,
                })
              }
            >
              <option value="">Any distance</option>
              {DISTANCE_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {d} miles
                </option>
              ))}
            </select>
          </div>
        </div>
      </FilterSection>

      {/* Availability commitment */}
      <FilterSection label="Availability">
        <div className="grid gap-1.5">
          {Object.values(AvailabilityCommitment).map((v) => {
            const checked = initialFilters.availability_commitment.includes(v);
            return (
              <label
                key={v}
                className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    apply({
                      availability_commitment: toggleArray(
                        initialFilters.availability_commitment,
                        v,
                      ),
                    })
                  }
                />
                {AVAILABILITY_COMMITMENT_LABELS[v]}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Time slots */}
      <FilterSection label="Time slots">
        <div className="grid gap-1.5">
          {Object.values(TimeSlot).map((v) => {
            const checked = initialFilters.time_slots.includes(v);
            return (
              <label
                key={v}
                className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    apply({
                      time_slots: toggleArray(initialFilters.time_slots, v),
                    })
                  }
                />
                {TIME_SLOT_LABELS[v]}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Show unavailable */}
      <FilterSection label="Also show">
        <label className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={initialFilters.show_unavailable}
            onCheckedChange={(checked) =>
              apply({ show_unavailable: checked === true })
            }
          />
          Nurses not accepting new clients
        </label>
      </FilterSection>

      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={clearAll}
        >
          Clear all filters
        </Button>
      </div>
    </div>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
        {label}
      </h3>
      {children}
    </div>
  );
}
