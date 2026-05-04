export default function VerificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <div className="bg-sage/15 mb-2 h-8 w-44 animate-pulse rounded" />
      <div className="bg-sage/10 mb-6 h-4 w-80 animate-pulse rounded" />

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-sage/20 bg-warm-white rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="bg-sage/15 h-5 w-44 animate-pulse rounded" />
                <div className="bg-sage/10 h-3 w-56 animate-pulse rounded" />
                <div className="bg-sage/10 h-3 w-40 animate-pulse rounded" />
              </div>
              <div className="flex gap-2">
                <div className="bg-sage/15 h-8 w-24 animate-pulse rounded-lg" />
                <div className="bg-sage/10 h-8 w-20 animate-pulse rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
