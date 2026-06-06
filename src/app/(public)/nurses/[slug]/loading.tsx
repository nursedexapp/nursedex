import { Header } from "@/components/shared/Header";

export default function NurseProfileLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <div className="flex gap-6">
          <div className="border-sage/20 bg-sage/15 size-28 shrink-0 animate-pulse rounded-xl border sm:size-32" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="bg-sage/15 h-7 w-48 animate-pulse rounded" />
            <div className="bg-sage/10 h-4 w-32 animate-pulse rounded" />
            <div className="bg-sage/10 h-3 w-40 animate-pulse rounded" />
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <div className="bg-sage/10 h-3 w-full animate-pulse rounded" />
          <div className="bg-sage/10 h-3 w-5/6 animate-pulse rounded" />
          <div className="bg-sage/10 h-3 w-3/4 animate-pulse rounded" />
        </div>

        <div className="border-sage/20 mt-8 rounded-xl border p-5">
          <div className="space-y-3">
            <div className="bg-sage/15 h-4 w-28 animate-pulse rounded" />
            <div className="bg-sage/10 h-3 w-3/4 animate-pulse rounded" />
            <div className="bg-sage/15 h-9 w-32 animate-pulse rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}
