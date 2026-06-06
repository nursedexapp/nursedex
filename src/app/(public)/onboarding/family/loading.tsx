/**
 * Skeleton for the family onboarding step (zip + survey hand-off). Heavy
 * because the form pulls in survey schema and validation; the skeleton
 * gives an instant signal that the page is on its way.
 */
export default function FamilyOnboardingLoading() {
  return (
    <div className="bg-warm-white min-h-screen px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="bg-sage/15 mb-2 h-7 w-56 animate-pulse rounded" />
        <div className="bg-sage/10 mb-8 h-4 w-72 animate-pulse rounded" />

        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-sage/15 h-3 w-32 animate-pulse rounded" />
              <div className="bg-sage/10 h-10 w-full animate-pulse rounded-lg" />
            </div>
          ))}
        </div>

        <div className="bg-sage/15 mt-8 h-10 w-full animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
