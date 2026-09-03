"use client";

import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { cn } from "@/lib/utils";

const STEP_LABELS = [
  "Basics",
  "Credentials",
  "Skills",
  "Bio & Photos",
  "Contact",
];

interface StepLayoutProps {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isSubmitting?: boolean;
  /**
   * Shown above the step's own fields, on every step. Used to tell a verified
   * nurse that families cannot see her yet (#732): she is sent to whichever
   * step she stopped at, so a message on one step alone reaches only the
   * nurses who happened to stop there.
   */
  banner?: React.ReactNode;
}

export function StepLayout({
  step,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  isSubmitting = false,
  banner,
}: StepLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Progress indicator. Circles are evenly spaced via
          justify-between (first flush left, last flush right) so the
          label below each circle stacks directly under it. The line
          connecting them is absolutely positioned behind, spanning
          from the center of the first circle (top-4 left-4) to the
          center of the last (right-4). The teal portion fills the
          fraction of segments completed up to the current step. */}
      <div className="mb-8">
        <div className="relative">
          <div className="bg-sage/30 absolute top-4 right-4 left-4 h-0.5 -translate-y-1/2" />
          <div
            className="bg-teal absolute top-4 left-4 h-0.5 -translate-y-1/2 transition-all duration-300"
            style={{
              width: `calc((100% - 2rem) * ${(step - 1) / (STEP_LABELS.length - 1)})`,
            }}
          />

          <div className="relative flex justify-between">
            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const isActive = stepNum === step;
              const isComplete = stepNum < step;

              return (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      // Both active and complete use the filled teal so the
                      // background line behind the circle doesn't bleed
                      // through. The icon (number vs check) distinguishes
                      // current from past.
                      (isActive || isComplete) && "bg-teal text-warm-white",
                      !isActive &&
                        !isComplete &&
                        "bg-sage/20 text-muted-foreground",
                    )}
                  >
                    {isComplete ? (
                      <svg
                        className="size-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs",
                      isActive
                        ? "text-teal font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step header */}
      <div className="mb-6">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          {title}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>

      {banner}

      {/* Step content */}
      <div className="space-y-6">{children}</div>

      {/* Navigation. items-end, not items-center: a stalled save stacks its
          message above the Continue button, and Back has to stay level with the
          button rather than float up beside the message. */}
      <div className="mt-8 flex items-end justify-between gap-4">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
          >
            Back
          </Button>
        ) : (
          <div />
        )}
        {/* A step save is an upsert (#443 phase 2), so a stalled one is safe to
            fire again. Retrying re-runs the same step submit. */}
        <PendingButton
          pending={isSubmitting}
          mode="retry"
          idleLabel={nextLabel}
          workingLabel="Saving..."
          slowLabel="Still saving..."
          onClick={onNext}
          onRetry={onNext}
          disabled={nextDisabled}
        />
      </div>
    </div>
  );
}
