import { Header } from "@/components/shared/Header";

export default function NursesLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="bg-sage/15 mb-4 h-8 w-48 animate-pulse rounded" />
        <div className="bg-sage/10 mb-6 h-4 w-72 animate-pulse rounded" />

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-sage/10 h-9 w-full animate-pulse rounded-lg"
                />
              ))}
            </div>
          </aside>

          <div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <NurseCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NurseCardSkeleton() {
  return (
    <div className="border-sage/20 bg-warm-white space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="bg-sage/15 size-12 animate-pulse rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="bg-sage/15 h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-sage/10 h-3 w-1/2 animate-pulse rounded" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="bg-sage/10 h-3 w-full animate-pulse rounded" />
        <div className="bg-sage/10 h-3 w-5/6 animate-pulse rounded" />
      </div>
      <div className="bg-sage/15 h-8 w-24 animate-pulse rounded-lg" />
    </div>
  );
}
