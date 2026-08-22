export default function NursesLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="max-w-site mx-auto w-full flex-1 px-6 py-6">
        <div className="bg-sage/15 mb-4 h-8 w-48 animate-pulse rounded" />
        <div className="bg-sage/10 mb-6 h-4 w-72 animate-pulse rounded" />

        {/* Chip row. Rewritten alongside the sidebar's removal: a skeleton
            drawing a layout the page no longer has flashes that layout on
            every navigation (#775). */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[88, 96, 72, 104, 80, 76, 108, 116].map((w, i) => (
            <div
              key={i}
              className="bg-sage/10 h-8 animate-pulse rounded-full"
              style={{ width: w }}
            />
          ))}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <NurseCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Mirrors the real card's anatomy: 64px round avatar, name and credential,
 * a pill row, a location line, bio lines, and a bordered footer. A skeleton
 * that draws a shape the page no longer has makes every navigation flash a
 * layout that is about to be replaced.
 */
function NurseCardSkeleton() {
  return (
    <div className="border-sage/20 flex flex-col rounded-2xl border bg-white">
      <div className="flex-1 space-y-3 p-5">
        <div className="flex items-start gap-3">
          <div className="bg-sage/15 size-16 shrink-0 animate-pulse rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="bg-sage/15 h-4 w-2/3 animate-pulse rounded" />
            <div className="bg-sage/10 h-3 w-1/2 animate-pulse rounded" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="bg-sage/15 h-5 w-24 animate-pulse rounded-full" />
          <div className="bg-sage/10 h-5 w-16 animate-pulse rounded-full" />
        </div>
        <div className="bg-sage/10 h-3 w-2/5 animate-pulse rounded" />
        <div className="space-y-2">
          <div className="bg-sage/10 h-3 w-full animate-pulse rounded" />
          <div className="bg-sage/10 h-3 w-5/6 animate-pulse rounded" />
        </div>
      </div>
      <div className="border-sage/20 flex items-center justify-between border-t px-5 py-3.5">
        <div className="bg-sage/10 h-3 w-24 animate-pulse rounded" />
        <div className="bg-sage/15 h-3 w-20 animate-pulse rounded" />
      </div>
    </div>
  );
}
