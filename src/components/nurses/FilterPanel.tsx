"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  toURLSearchParams,
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

const nativeSelectCls =
  "flex h-9 w-full cursor-pointer rounded-lg border border-input bg-white px-3 text-sm text-soft-black transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50";

export function FilterPanel({
  initialFilters,
  onAfterChange,
}: FilterPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const apply = (next: Partial<SearchFilters>) => {
    // Always reset page to 1 on filter change, the new result set likely
    // has a different size than the previous one.
    const merged: Partial<SearchFilters> = {
      ...initialFilters,
      ...next,
      page: 1,
    };
    const params = toURLSearchParams(merged);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/nurses?${query}` : "/nurses", { scroll: false });
      onAfterChange?.();
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.replace("/nurses", { scroll: false });
      onAfterChange?.();
    });
  };

  const toggleArray = <T extends string>(current: T[], value: T): T[] =>
    current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];

  return (
    <div
      className={cn(
        "space-y-6 text-sm",
        isPending && "pointer-events-none opacity-70",
      )}
    >
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

const COMMIT_DELAY_MS = 400;

const parseFilterInt = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

// Free text filter inputs cannot be controlled directly by the URL state:
// every keystroke starts a router transition, and the re-render that follows
// would reset the input to the stale URL value, eating fast keystrokes
// (e.g. the second digit of "15 years"). The typed text lives in local state
// and is committed to the URL after a short pause.
function DebouncedFilterInput({
  value,
  onCommit,
  sanitize,
  renderHint,
  ...inputProps
}: {
  value: string;
  onCommit: (raw: string) => void;
  sanitize?: (raw: string) => string;
  renderHint?: (text: string) => React.ReactNode;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [text, setText] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitPendingRef = useRef(false);
  const lastValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Adopt external URL changes (clear all, back/forward navigation) unless
  // the user has an uncommitted edit in flight.
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      if (!commitPendingRef.current) setText(value);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const hint = renderHint?.(text);
  const hintId = inputProps.id ? `${inputProps.id}-hint` : undefined;

  return (
    <>
      <Input
        {...inputProps}
        aria-describedby={
          hint && hintId ? hintId : inputProps["aria-describedby"]
        }
        value={text}
        onChange={(e) => {
          const raw = sanitize ? sanitize(e.target.value) : e.target.value;
          setText(raw);
          commitPendingRef.current = true;
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            commitPendingRef.current = false;
            onCommitRef.current(raw);
          }, COMMIT_DELAY_MS);
        }}
      />
      {renderHint ? (
        <p
          id={hintId}
          role="status"
          aria-live="polite"
          className="text-soft-black-light mt-1 min-h-4 text-xs"
        >
          {hint}
        </p>
      ) : null}
    </>
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
