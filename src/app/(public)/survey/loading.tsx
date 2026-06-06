/**
 * Skeleton for the family survey multistep form. Renders while the
 * survey wizard's form schemas and step components stream in.
 */
export default function SurveyLoading() {
  return (
    <div className="bg-warm-white min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="bg-sage/15 mx-auto mb-2 h-7 w-48 animate-pulse rounded" />
        <div className="bg-sage/10 mx-auto mb-8 h-4 w-64 animate-pulse rounded" />

        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-sage/10 h-14 w-full animate-pulse rounded-lg"
            />
          ))}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <div className="bg-sage/10 h-10 w-20 animate-pulse rounded-lg" />
          <div className="bg-sage/15 h-10 w-24 animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
