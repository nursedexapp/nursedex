"use client";

import { useId, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DebouncedFilterInput, parseFilterInt } from "./DebouncedFilterInput";
import { useApplyFilters } from "./useApplyFilters";
import { nativeSelectCls } from "./native-select";
import { Credential, CareType, Gender } from "@/types/enums";
import type { DirectoryFacets, FacetOption } from "@/lib/nurses/facets";
import { facetOptionLabel } from "@/lib/nurses/facet-labels";
import {
  GENDER_FILTER_ANY,
  type SearchFilters,
  type GenderFilter,
} from "@/lib/nurses/search-params";

const DISTANCE_OPTIONS = [5, 10, 25, 50, 100] as const;

// The ceiling the box accepts when we could not count the directory. Every
// listed nurse has a years_experience, so with facets the real maximum is
// used instead and asking for more than the most experienced nurse is not
// offered at all.
const EXPERIENCE_FALLBACK_MAX = 70;

interface FilterPanelProps {
  initialFilters: SearchFilters;
  /**
   * What the directory can actually be filtered by, counted from the nurses
   * in it (#766). `null` means the count could not be read: the panel says so
   * rather than rendering every section empty, which would read as a
   * directory holding nobody (#780).
   */
  facets: DirectoryFacets | null;
  // Called after each URL change. Used by the mobile sheet to auto-close.
  onAfterChange?: () => void;
}

export function FilterPanel({
  initialFilters,
  facets,
  onAfterChange,
}: FilterPanelProps) {
  const [isPending, startTransition] = useTransition();
  const { apply: applyToUrl, clearAll: clearAllInUrl } = useApplyFilters();
  const idPrefix = useId();

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

  // A specific gender excludes prefer_not_to_say, so it is not offered as a
  // choice even when nurses have selected it (the existing product decision;
  // "Any" still includes them).
  const genderOptions =
    facets?.gender.filter((o) => o.value !== Gender.PREFER_NOT_TO_SAY) ?? [];

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

      {facets === null && (
        <p className="text-soft-black-light text-sm">
          We could not load the filter options just now. You can still search
          by location, rate and experience, or try again in a moment.
        </p>
      )}

      {/* Credential */}
      {facets && facets.credential.length > 0 && (
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
            {facets.credential.map((o) => (
              <option key={o.value} value={o.value}>
                {facetOptionLabel("credential", o)}
              </option>
            ))}
          </select>
        </FilterSection>
      )}

      {/* Care type */}
      {facets && facets.care_types.length > 0 && (
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
            {facets.care_types.map((o) => (
              <option key={o.value} value={o.value}>
                {facetOptionLabel("care_types", o)}
              </option>
            ))}
          </select>
        </FilterSection>
      )}

      {/* Skills */}
      {facets && facets.skills.length > 0 && (
        <CheckboxFacet
          idPrefix={idPrefix}
          facet="skills"
          label="Skills"
          options={facets.skills}
          selected={initialFilters.skills}
          onToggle={(value) =>
            apply({
              skills: toggleArray(
                initialFilters.skills,
                value as SearchFilters["skills"][number],
              ),
            })
          }
        />
      )}

      {/* Languages */}
      {facets && facets.languages.length > 0 && (
        <CheckboxFacet
          idPrefix={idPrefix}
          facet="languages"
          label="Languages"
          options={facets.languages}
          selected={initialFilters.languages}
          onToggle={(value) =>
            apply({ languages: toggleArray(initialFilters.languages, value) })
          }
        />
      )}

      {/* Gender */}
      {genderOptions.length > 0 && (
        <FilterSection label="Gender">
          <select
            className={nativeSelectCls}
            value={initialFilters.gender}
            onChange={(e) => apply({ gender: e.target.value as GenderFilter })}
          >
            <option value={GENDER_FILTER_ANY}>Any</option>
            {genderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {facetOptionLabel("gender", o)}
              </option>
            ))}
          </select>
        </FilterSection>
      )}

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
        {facets?.rate && (
          // A hint, deliberately not a bound. A nurse who states no minimum
          // rate matches every budget, so a lower number is not a dead end.
          <p className="text-soft-black-light text-xs">
            Nurses here list ${facets.rate.min} to ${facets.rate.max} an hour.
          </p>
        )}
      </FilterSection>

      {/* Experience min */}
      <FilterSection label="Min years of experience">
        <DebouncedFilterInput
          type="number"
          inputMode="numeric"
          min={0}
          max={facets?.experience?.max ?? EXPERIENCE_FALLBACK_MAX}
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
      {facets && facets.availability_commitment.length > 0 && (
        <CheckboxFacet
          idPrefix={idPrefix}
          facet="availability_commitment"
          label="Availability"
          options={facets.availability_commitment}
          selected={initialFilters.availability_commitment}
          onToggle={(value) =>
            apply({
              availability_commitment: toggleArray(
                initialFilters.availability_commitment,
                value as SearchFilters["availability_commitment"][number],
              ),
            })
          }
        />
      )}

      {/* Time slots */}
      {facets && facets.time_slots.length > 0 && (
        <CheckboxFacet
          idPrefix={idPrefix}
          facet="time_slots"
          label="Time slots"
          options={facets.time_slots}
          selected={initialFilters.time_slots}
          onToggle={(value) =>
            apply({
              time_slots: toggleArray(
                initialFilters.time_slots,
                value as SearchFilters["time_slots"][number],
              ),
            })
          }
        />
      )}

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

/**
 * One multi-select filter, rendered from the directory's own values.
 *
 * The label carries the count and is tied to the checkbox by id: a wrapping
 * label does not name a Radix checkbox to assistive technology, because the
 * control it renders is a button rather than a labelable input.
 */
function CheckboxFacet({
  idPrefix,
  facet,
  label,
  options,
  selected,
  onToggle,
}: {
  idPrefix: string;
  facet: string;
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <FilterSection label={label}>
      <div className="grid gap-1.5">
        {options.map((o) => {
          const id = `${idPrefix}-${facet}-${o.value}`;
          return (
            <div key={o.value} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(o.value)}
                onCheckedChange={() => onToggle(o.value)}
              />
              <label
                htmlFor={id}
                className="text-soft-black-light cursor-pointer text-sm"
              >
                {facetOptionLabel(facet, o)}
              </label>
            </div>
          );
        })}
      </div>
    </FilterSection>
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
