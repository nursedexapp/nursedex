"use client";

import { Heart, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
  SKILL_LABELS,
  GENDER_LABELS,
  Credential,
  CareType,
  Skill,
  Gender,
} from "@/types/enums";
import {
  GENDER_FILTER_ANY,
  type GenderFilter,
  type SearchFilters,
} from "@/lib/nurses/search-params";
import {
  ROW_CHIP_IDS,
  appliedSheetChips,
  chipLabel,
  clearChipPatch,
  isChipApplied,
  sheetAppliedCount,
  type ChipId,
  type RowChipId,
} from "@/lib/nurses/filter-chips";
import { FilterChip } from "./FilterChip";
import { FilterSheet } from "./FilterSheet";
import { DebouncedFilterInput, parseFilterInt } from "./DebouncedFilterInput";
import { useApplyFilters } from "./useApplyFilters";

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

interface FilterChipRowProps {
  filters: SearchFilters;
  /**
   * How many nurses this family has saved, or null for a viewer who has no
   * saved list (logged out, or a nurse account). Null hides the chip entirely
   * rather than offering a control that would do nothing (#776).
   */
  savedCount: number | null;
}

/**
 * The filter row that replaced the sidebar.
 *
 * Seven filters get their own chip; the rest live behind "More filters", which
 * opens the same sheet the phone already used. An applied filter from that
 * hidden group still appears here as its own clearable chip, so nothing
 * constraining the results is ever invisible: a family arriving from the
 * survey with a zip and a distance set would otherwise see an empty looking
 * row above a thin grid, with no visible cause (#775).
 */
export function FilterChipRow({ filters, savedCount }: FilterChipRowProps) {
  const { apply, clearAll } = useApplyFilters();
  const hidden = appliedSheetChips(filters);
  const moreCount = sheetAppliedCount(filters);
  const anyApplied =
    moreCount > 0 ||
    filters.saved ||
    ROW_CHIP_IDS.some((id) => isChipApplied(id, filters));

  const clear = (id: ChipId) => () => apply(clearChipPatch(id));

  const chip = (
    id: RowChipId,
    body: (close: () => void) => React.ReactNode,
  ) => (
    <FilterChip
      key={id}
      label={chipLabel(id, filters)}
      applied={isChipApplied(id, filters)}
      onClear={clear(id)}
    >
      {body}
    </FilterChip>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {savedCount !== null && (
        <button
          type="button"
          onClick={() => apply({ saved: !filters.saved })}
          aria-pressed={filters.saved}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-3.5 text-sm transition-colors",
            "focus-visible:ring-teal focus-visible:ring-2 focus-visible:outline-none",
            filters.saved
              ? "border-teal bg-teal text-white"
              : "border-sage/50 text-soft-black hover:border-sage bg-white",
          )}
        >
          <Heart
            className={cn("size-3.5", filters.saved && "fill-current")}
            aria-hidden="true"
          />
          Saved
          <span
            className={cn(
              "text-xs",
              filters.saved ? "text-white/90" : "text-soft-black-light",
            )}
          >
            ({savedCount})
          </span>
        </button>
      )}

      {chip("credential", (close) => (
        <ChoiceList
          name="Credential"
          value={filters.credential ?? ""}
          options={Object.values(Credential).map((c) => ({
            value: c,
            label: CREDENTIAL_LABELS[c],
          }))}
          anyLabel="Any credential"
          onSelect={(value) => {
            apply({ credential: (value || undefined) as Credential });
            close();
          }}
        />
      ))}

      {chip("care_type", (close) => (
        <ChoiceList
          name="Care type"
          value={filters.care_type ?? ""}
          options={Object.values(CareType).map((c) => ({
            value: c,
            label: CARE_TYPE_LABELS[c],
          }))}
          anyLabel="Any care type"
          onSelect={(value) => {
            apply({ care_type: (value || undefined) as CareType });
            close();
          }}
        />
      ))}

      {chip("skills", () => (
        <CheckList
          name="Skills"
          values={filters.skills}
          options={Object.values(Skill).map((s) => ({
            value: s,
            label: SKILL_LABELS[s],
          }))}
          onToggle={(next) => apply({ skills: next as Skill[] })}
        />
      ))}

      {chip("languages", () => (
        <CheckList
          name="Languages"
          values={filters.languages}
          options={FILTER_LANGUAGES.map((l) => ({ value: l, label: l }))}
          onToggle={(next) => apply({ languages: next })}
        />
      ))}

      {chip("gender", (close) => (
        <ChoiceList
          name="Gender"
          value={filters.gender === GENDER_FILTER_ANY ? "" : filters.gender}
          options={Object.values(Gender)
            .filter((g) => g !== Gender.PREFER_NOT_TO_SAY)
            .map((g) => ({ value: g, label: GENDER_LABELS[g] }))}
          anyLabel="Any"
          onSelect={(value) => {
            apply({ gender: (value || GENDER_FILTER_ANY) as GenderFilter });
            close();
          }}
        />
      ))}

      {chip("rate_max", () => (
        <fieldset className="space-y-2">
          <legend className="text-soft-black text-sm font-medium">
            Hourly rate
          </legend>
          <label className="text-soft-black-light block text-xs">
            Most you want to pay
            <DebouncedFilterInput
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="mt-1"
              placeholder="e.g. 40"
              value={
                filters.rate_max !== undefined ? String(filters.rate_max) : ""
              }
              onCommit={(raw) => apply({ rate_max: parseFilterInt(raw) })}
            />
          </label>
        </fieldset>
      ))}

      {chip("experience_min", () => (
        <label className="text-soft-black-light block text-xs">
          <span className="text-soft-black mb-1 block text-sm font-medium">
            Least experience
          </span>
          Years
          <DebouncedFilterInput
            type="number"
            inputMode="numeric"
            min={0}
            max={70}
            step={1}
            className="mt-1"
            placeholder="e.g. 5"
            value={
              filters.experience_min !== undefined
                ? String(filters.experience_min)
                : ""
            }
            onCommit={(raw) => apply({ experience_min: parseFilterInt(raw) })}
          />
        </label>
      ))}

      {/* Applied filters that live behind More filters, surfaced so they can
          be seen and cleared without opening the sheet. */}
      {hidden.map((id) => (
        <span
          key={id}
          className="border-teal bg-teal inline-flex items-center rounded-full border text-sm text-white"
        >
          <span className="py-1.5 pl-3.5">{chipLabel(id, filters)}</span>
          <button
            type="button"
            onClick={clear(id)}
            aria-label={`Clear ${chipLabel(id, filters)}`}
            className="cursor-pointer rounded-full py-1.5 pr-3 pl-1 text-white/90 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </span>
      ))}

      <FilterSheet
        initialFilters={filters}
        trigger={
          <span
            className={cn(
              "border-sage/50 text-soft-black hover:border-sage inline-flex items-center gap-1.5 rounded-full border bg-white py-1.5 pr-3 pl-3.5 text-sm",
            )}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            More filters
            {moreCount > 0 && (
              <span className="bg-teal ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-xs font-medium text-white">
                {moreCount}
              </span>
            )}
          </span>
        }
      />

      {anyApplied && (
        <button
          type="button"
          onClick={clearAll}
          className="text-soft-black-light hover:text-soft-black cursor-pointer px-1 text-sm underline underline-offset-4"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function ChoiceList({
  name,
  value,
  options,
  anyLabel,
  onSelect,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  anyLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <fieldset className="max-h-72 overflow-y-auto">
      <legend className="text-soft-black mb-1.5 text-sm font-medium">
        {name}
      </legend>
      <div className="grid gap-0.5">
        {[{ value: "", label: anyLabel }, ...options].map((option) => (
          <label
            key={option.value || "any"}
            className="text-soft-black-light hover:bg-sage/10 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
          >
            <input
              type="radio"
              name={name}
              className="accent-teal"
              checked={value === option.value}
              onChange={() => onSelect(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckList({
  name,
  values,
  options,
  onToggle,
}: {
  name: string;
  values: string[];
  options: { value: string; label: string }[];
  onToggle: (next: string[]) => void;
}) {
  return (
    <fieldset className="max-h-72 overflow-y-auto">
      <legend className="text-soft-black mb-1.5 text-sm font-medium">
        {name}
      </legend>
      <div className="grid gap-1.5">
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label
              key={option.value}
              className="text-soft-black-light flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() =>
                  onToggle(
                    checked
                      ? values.filter((v) => v !== option.value)
                      : [...values, option.value],
                  )
                }
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
