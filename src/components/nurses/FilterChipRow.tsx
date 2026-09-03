"use client";

import { Heart, SlidersHorizontal, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Credential, CareType, Skill, Gender } from "@/types/enums";
import type { DirectoryFacets } from "@/lib/nurses/facets";
import { facetOptionLabel } from "@/lib/nurses/facet-labels";
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

interface FilterChipRowProps {
  filters: SearchFilters;
  /**
   * How many nurses this family has saved, or null for a viewer who has no
   * saved list (logged out, or a nurse account). Null hides the chip entirely
   * rather than offering a control that would do nothing (#776).
   */
  savedCount: number | null;
  /**
   * What the directory can actually be filtered by, counted from the nurses
   * in it (#766). A chip is offered only where at least one nurse is behind
   * an option, or where the family already has that filter applied, so a
   * constraint on the results is never invisible.
   *
   * `null` means the count could not be read: the row says so rather than
   * quietly dropping five of its seven chips.
   */
  facets: DirectoryFacets | null;
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
export function FilterChipRow({
  filters,
  savedCount,
  facets,
}: FilterChipRowProps) {
  const { apply, clearAll } = useApplyFilters();
  const hidden = appliedSheetChips(filters);
  const moreCount = sheetAppliedCount(filters);
  const anyApplied =
    moreCount > 0 ||
    filters.saved ||
    ROW_CHIP_IDS.some((id) => isChipApplied(id, filters));

  const clear = (id: ChipId) => () => apply(clearChipPatch(id));

  // A chip whose options are all empty cannot narrow anything, so it is not
  // offered. It stays if the family already applied it, because a filter
  // constraining the results must always be visible and clearable (#775).
  const offers = (id: RowChipId, options: unknown[]) =>
    options.length > 0 || isChipApplied(id, filters);

  const genderOptions = (facets?.gender ?? []).filter(
    (o) => o.value !== Gender.PREFER_NOT_TO_SAY,
  );

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
              filters.saved ? "text-white" : "text-soft-black-light",
            )}
          >
            ({savedCount})
          </span>
        </button>
      )}

      {offers("credential", facets?.credential ?? []) &&
        chip("credential", (close) => (
        <ChoiceList
          name="Credential"
          value={filters.credential ?? ""}
          options={(facets?.credential ?? []).map((o) => ({
            value: o.value,
            label: facetOptionLabel("credential", o),
          }))}
          anyLabel="Any credential"
          onSelect={(value) => {
            apply({ credential: (value || undefined) as Credential });
            close();
          }}
        />
      ))}

      {offers("care_type", facets?.care_types ?? []) &&
        chip("care_type", (close) => (
        <ChoiceList
          name="Care type"
          value={filters.care_type ?? ""}
          options={(facets?.care_types ?? []).map((o) => ({
            value: o.value,
            label: facetOptionLabel("care_types", o),
          }))}
          anyLabel="Any care type"
          onSelect={(value) => {
            apply({ care_type: (value || undefined) as CareType });
            close();
          }}
        />
      ))}

      {offers("skills", facets?.skills ?? []) &&
        chip("skills", () => (
        <CheckList
          name="Skills"
          values={filters.skills}
          options={(facets?.skills ?? []).map((o) => ({
            value: o.value,
            label: facetOptionLabel("skills", o),
          }))}
          onToggle={(next) => apply({ skills: next as Skill[] })}
        />
      ))}

      {offers("languages", facets?.languages ?? []) &&
        chip("languages", () => (
          <CheckList
            name="Languages"
            values={filters.languages}
            options={(facets?.languages ?? []).map((o) => ({
              value: o.value,
              label: facetOptionLabel("languages", o),
            }))}
            onToggle={(next) => apply({ languages: next })}
          />
        ))}

      {offers("gender", genderOptions) &&
        chip("gender", (close) => (
        <ChoiceList
          name="Gender"
          value={filters.gender === GENDER_FILTER_ANY ? "" : filters.gender}
          options={genderOptions.map((o) => ({
            value: o.value,
            label: facetOptionLabel("gender", o),
          }))}
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
            max={facets?.experience?.max ?? 70}
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
            className="cursor-pointer rounded-full py-1.5 pr-3 pl-1 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}

      <FilterSheet
        initialFilters={filters}
        facets={facets}
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

      {facets === null && (
        <p className="text-soft-black-light text-sm">
          We could not load the filter options just now.
        </p>
      )}

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
