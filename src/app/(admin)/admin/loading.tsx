// Shared loading skeleton for the admin section. Without it, navigating
// between admin pages (server components that fetch on the server) gave no
// feedback, so a click felt unresponsive. /admin/verifications keeps its
// own more specific skeleton; everything else falls back to this.
export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <div className="bg-sage/15 mb-2 h-8 w-40 animate-pulse rounded" />
      <div className="bg-sage/10 mb-6 h-4 w-72 animate-pulse rounded" />

      {/* Stat cards (dashboard / analytics) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border-sage/20 bg-warm-white space-y-3 rounded-xl border p-4"
          >
            <div className="bg-sage/10 h-3 w-24 animate-pulse rounded" />
            <div className="bg-sage/15 h-7 w-16 animate-pulse rounded" />
          </div>
        ))}
      </div>

      {/* List rows (queues / accounts / reviews) */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-sage/20 bg-warm-white flex items-center justify-between gap-3 rounded-xl border p-4"
          >
            <div className="space-y-2">
              <div className="bg-sage/15 h-5 w-44 animate-pulse rounded" />
              <div className="bg-sage/10 h-3 w-56 animate-pulse rounded" />
            </div>
            <div className="bg-sage/10 h-8 w-20 animate-pulse rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
