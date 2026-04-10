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
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isComplete = stepNum < step;

            return (
              <div
                key={label}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div className="flex w-full items-center">
                  {i > 0 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        isComplete || isActive
                          ? "bg-teal"
                          : "bg-sage/30",
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      isActive && "bg-teal text-white",
                      isComplete && "bg-teal/20 text-teal",
                      !isActive && !isComplete && "bg-sage/20 text-muted-foreground",
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
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        isComplete ? "bg-teal" : "bg-sage/30",
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs",
                    isActive
                      ? "font-medium text-teal"
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

      {/* Step header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
