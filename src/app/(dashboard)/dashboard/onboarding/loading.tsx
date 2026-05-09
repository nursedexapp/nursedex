/**
 * Skeleton that shows the moment a user starts navigating to the
 * onboarding wizard. The wizard itself is heavy (loads form schemas,
 * StepLayout, and several profile-form sub-components), so without
 * this the user sees nothing between clicking Continue Setup and the
 * page render. Skeleton loosely mirrors the wizard's actual layout so
 * the transition into real content feels continuous, not jarring.
 */
export default function OnboardingLoading() {
  return (
    <div className="bg-warm-white min-h-screen px-6 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Step indicator row */}
        <div className="mb-6 flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div className="bg-sage/15 size-7 shrink-0 animate-pulse rounded-full" />
              {i < 4 && (
                <div className="bg-sage/10 h-px flex-1 animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Heading + description */}
        <div className="bg-sage/15 mb-2 h-7 w-48 animate-pulse rounded" />
        <div className="bg-sage/10 mb-6 h-4 w-72 animate-pulse rounded" />

        {/* Form fields */}
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-sage/15 h-3 w-32 animate-pulse rounded" />
              <div className="bg-sage/10 h-10 w-full animate-pulse rounded-lg" />
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="mt-8 flex justify-end gap-3">
          <div className="bg-sage/10 h-9 w-20 animate-pulse rounded-lg" />
          <div className="bg-sage/15 h-9 w-24 animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
