"use client";

import { Button } from "@/components/ui/button";
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
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      isActive && "bg-teal text-white",
                      isComplete && "bg-teal/20 text-teal",
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

      {/* Step content */}
      <div className="space-y-6">{children}</div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
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
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || isSubmitting}
        >
          {isSubmitting ? "Saving..." : nextLabel}
        </Button>
      </div>
    </div>
  );
}
