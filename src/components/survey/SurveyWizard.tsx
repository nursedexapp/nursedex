"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CareType,
  CARE_TYPE_LABELS,
  Skill,
  SKILL_LABELS,
  AvailabilityCommitment,
  AVAILABILITY_COMMITMENT_LABELS,
  TimeSlot,
  TIME_SLOT_LABELS,
} from "@/types/enums";
import {
  toURLSearchParams,
  type SearchFilters,
} from "@/lib/nurses/search-params";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { DirectoryFacets } from "@/lib/nurses/facets";
import { ChevronLeft } from "lucide-react";

const TOTAL_STEPS = 4;
const DEFAULT_DISTANCE_MILES = 25;
interface SurveyWizardProps {
  initialFilters: SearchFilters;
  initialStep: number;
  /**
   * What the directory can actually be filtered by (#766). The survey's
   * answers become a prefilled search, so an option nobody is behind takes a
   * family who answered every question to an empty results page.
   *
   * Deliberately rendered WITHOUT the counts the directory's own filter panel
   * shows: this is a conversation about what she needs, not a filter panel.
   *
   * `null` means they could not be counted. The survey cannot ask its
   * questions without them, so it says so and offers the directory instead.
   */
  facets: DirectoryFacets | null;
}

export function SurveyWizard({
  initialFilters,
  initialStep,
  facets,
}: SurveyWizardProps) {
  const router = useRouter();

  // Step-local edits before user clicks Next.
  const [careType, setCareType] = useState<CareType | undefined>(
    initialFilters.care_type as CareType | undefined,
  );
  const [skills, setSkills] = useState<Skill[]>(
    initialFilters.skills as Skill[],
  );
  const [commitment, setCommitment] = useState<AvailabilityCommitment[]>(
    initialFilters.availability_commitment as AvailabilityCommitment[],
  );
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(
    initialFilters.time_slots as TimeSlot[],
  );
  const [zip, setZip] = useState(initialFilters.zip ?? "");
  const [languages, setLanguages] = useState<string[]>(
    initialFilters.languages,
  );

  // Fire survey_started once per session.
  const startedFired = useRef(false);
  useEffect(() => {
    if (startedFired.current) return;
    startedFired.current = true;
    if (posthog.__loaded) {
      posthog.capture(ANALYTICS_EVENTS.SURVEY_STARTED);
    }
  }, []);

  const buildFilters = (): Partial<SearchFilters> => ({
    care_type: careType,
    skills,
    availability_commitment: commitment,
    time_slots: timeSlots,
    zip: zip.length === 5 ? zip : undefined,
    languages,
    distance: zip.length === 5 ? DEFAULT_DISTANCE_MILES : undefined,
  });

  const goToStep = (step: number) => {
    const params = toURLSearchParams(buildFilters());
    params.set("step", String(step));
    router.push(`/survey?${params.toString()}`, { scroll: true });
  };

  const submit = () => {
    const params = toURLSearchParams(buildFilters());
    router.push(`/survey/results?${params.toString()}`, { scroll: true });
  };

  const canAdvance = (): boolean => {
    if (initialStep === 1) return !!careType;
    if (initialStep === 4) return /^\d{5}$/.test(zip);
    return true; // Steps 2 and 3 are optional
  };

  const toggleArray = <T extends string>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  if (facets === null) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          We could not load the questions just now
        </h1>
        <p className="text-soft-black-light text-sm">
          Rather than ask you what you need and then have nothing to match it
          against, here is the whole directory.
        </p>
        <Link
          href="/nurses"
          className="text-teal text-sm font-medium underline underline-offset-4"
        >
          Browse all nurses
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header step={initialStep} />

      {initialStep === 1 && (
        <Step heading="What kind of care are you looking for?">
          <div className="grid gap-2 sm:grid-cols-2">
            {(facets?.care_types ?? []).map(({ value: c }) => {
              const selected = careType === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCareType(c)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    selected
                      ? "border-teal bg-teal/5 text-soft-black"
                      : "border-input hover:bg-sage/10",
                  )}
                  aria-pressed={selected}
                >
                  {CARE_TYPE_LABELS[c]}
                </button>
              );
            })}
          </div>
        </Step>
      )}

      {initialStep === 2 && (
        <Step
          heading="Which skills matter most?"
          subheading="Optional. Pick any that apply, we'll prioritize nurses who have them."
        >
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(facets?.skills ?? []).map(({ value: s }) => {
              const checked = skills.includes(s);
              return (
                <label
                  key={s}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked
                      ? "border-teal bg-teal/5"
                      : "border-input hover:bg-sage/10",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setSkills((prev) => toggleArray(prev, s))
                    }
                  />
                  {SKILL_LABELS[s]}
                </label>
              );
            })}
          </div>
        </Step>
      )}

      {initialStep === 3 && (
        <Step
          heading="When do you need care?"
          subheading="Optional. Pick the schedule that fits your situation best."
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
                Commitment
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(facets?.availability_commitment ?? []).map(({ value: v }) => {
                  const checked = commitment.includes(v);
                  return (
                    <label
                      key={v}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-teal bg-teal/5"
                          : "border-input hover:bg-sage/10",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setCommitment((prev) => toggleArray(prev, v))
                        }
                      />
                      {AVAILABILITY_COMMITMENT_LABELS[v]}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
                Time slots
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {(facets?.time_slots ?? []).map(({ value: v }) => {
                  const checked = timeSlots.includes(v);
                  return (
                    <label
                      key={v}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-teal bg-teal/5"
                          : "border-input hover:bg-sage/10",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setTimeSlots((prev) => toggleArray(prev, v))
                        }
                      />
                      {TIME_SLOT_LABELS[v]}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Step>
      )}

      {initialStep === 4 && (
        <Step
          heading="Where in New York?"
          subheading="Your zip helps us show nurses within reach. Languages are optional."
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="survey-zip">Your zip code</Label>
              <Input
                id="survey-zip"
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="11779"
                value={zip}
                onChange={(e) =>
                  setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                className="max-w-[160px]"
                autoFocus
              />
              <p className="text-soft-black-light text-xs">
                We&apos;ll show nurses within 25 miles. You can adjust on the
                results page.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
                Preferred languages (optional)
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(facets?.languages ?? []).map(({ value: lang }) => {
                  const checked = languages.includes(lang);
                  return (
                    <label
                      key={lang}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-teal bg-teal/5"
                          : "border-input hover:bg-sage/10",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setLanguages((prev) => toggleArray(prev, lang))
                        }
                      />
                      {lang}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Step>
      )}

      {/* Footer: Back + Next/Submit */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {initialStep > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => goToStep(initialStep - 1)}
            className="gap-1"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : (
          <span />
        )}

        {initialStep < TOTAL_STEPS ? (
          <Button
            type="button"
            onClick={() => goToStep(initialStep + 1)}
            disabled={!canAdvance()}
          >
            Next
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={!canAdvance()}>
            See matches
          </Button>
        )}
      </div>
    </div>
  );
}

function Header({ step }: { step: number }) {
  return (
    <div className="space-y-3">
      <p className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
        Step {step} of {TOTAL_STEPS}
      </p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              n <= step ? "bg-teal" : "bg-sage/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Step({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          {heading}
        </h1>
        {subheading && (
          <p className="text-soft-black-light text-sm">{subheading}</p>
        )}
      </div>
      {children}
    </div>
  );
}
