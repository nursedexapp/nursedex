import type { Metadata } from "next";
import Link from "next/link";
import { NurseCard } from "@/components/nurses/NurseCard";
import { FilterPanel } from "@/components/nurses/FilterPanel";
import { FilterSheet } from "@/components/nurses/FilterSheet";
import { SearchAnalytics } from "@/components/nurses/SearchAnalytics";
import { SearchPagination } from "@/components/nurses/SearchPagination";
import { SurveyAppliedBanner } from "@/components/nurses/SurveyAppliedBanner";
import { getCurrentUser } from "@/lib/auth/helpers";
import { searchNurses } from "@/lib/nurses/search";
import { getSavedNurseIds } from "@/lib/nurses/saves";
import { getRevealedNurseIds } from "@/lib/reveals/queries";
import { logSearchGap } from "@/lib/nurses/search-gap";
import {
  parseSearchParams,
  isEmptyFilterSet,
} from "@/lib/nurses/search-params";

export const metadata: Metadata = {
  title: "Find a Nurse | NurseDex",
  description:
    "Search home care nurses and aides across New York. Filter by credential, specialty, availability, and more.",
  openGraph: {
    title: "Find a Nurse on NurseDex",
    description:
      "Search home care nurses and aides across New York. Filter by credential, specialty, availability, and more.",
    url: "https://nursedex.com/nurses",
  },
};

interface NursesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NursesPage({ searchParams }: NursesPageProps) {
  const raw = await searchParams;
  const filters = parseSearchParams(raw);
  const fromSurvey =
    (Array.isArray(raw.from) ? raw.from[0] : raw.from) === "survey";
  const user = await getCurrentUser();

  const viewerZip = user?.zip_code ?? null;
  const viewerCommPref = user?.communication_preference ?? null;

  // Save/reveal state only applies to family viewers.
  const showSaves = user?.role === "family";

  // The reveal lookup only annotates results (it doesn't change the query), so
  // run it alongside the search instead of waiting for it first.
  const [viewerRevealedIds, result] = await Promise.all([
    showSaves && user
      ? getRevealedNurseIds(user.id)
      : Promise.resolve(undefined),
    searchNurses({ filters, viewerZip, viewerCommPref }),
  ]);

  if (viewerRevealedIds && viewerRevealedIds.size > 0) {
    for (const c of result.items) c.revealed = viewerRevealedIds.has(c.user_id);
    for (const c of result.partials)
      c.revealed = viewerRevealedIds.has(c.user_id);
  }

  const savedIds = showSaves
    ? await getSavedNurseIds([
        ...result.items.map((n) => n.user_id),
        ...result.partials.map((n) => n.user_id),
      ])
    : new Set<string>();

  // Log low-result searches so we can spot care-type gaps later.
  // Fire-and-forget, never block render.
  if (!isEmptyFilterSet(filters) && result.totalFull < 5) {
    logSearchGap(filters, result.totalFull);
  }

  const totalShown = result.items.length + result.partials.length;
  const hasResults = totalShown > 0;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {/* Title + mobile filter trigger */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
              Find a Nurse
            </h1>
            <p className="text-soft-black-light mt-1 text-sm">
              {result.totalFull === 0
                ? "No nurses match your filters yet."
                : `${result.totalFull} ${result.totalFull === 1 ? "nurse" : "nurses"} found`}
            </p>
          </div>
          <div className="lg:hidden">
            <FilterSheet initialFilters={filters} />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Desktop filters */}
          <aside className="hidden lg:block">
            <FilterPanel initialFilters={filters} />
          </aside>

          {/* Results column */}
          <div className="min-w-0">
            {fromSurvey && <SurveyAppliedBanner />}
            {!user && hasResults && <AnonSignupBanner />}

            {hasResults ? (
              <>
                {result.items.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {result.items.map((nurse) => (
                      <NurseCard
                        key={nurse.user_id}
                        nurse={nurse}
                        saveState={
                          showSaves
                            ? { isSaved: savedIds.has(nurse.user_id) }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {result.partials.length > 0 && (
                  <section className="mt-10">
                    <div className="border-sage/20 mb-4 border-t pt-6">
                      <h2 className="font-heading text-soft-black text-lg font-medium">
                        Other nurses you might consider
                      </h2>
                      <p className="text-soft-black-light mt-1 text-sm">
                        These don&apos;t match every filter but are close to
                        what you&apos;re looking for.
                      </p>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {result.partials.map((nurse) => (
                        <NurseCard
                          key={`partial-${nurse.user_id}`}
                          nurse={nurse}
                          dimmed
                          saveState={
                            showSaves
                              ? { isSaved: savedIds.has(nurse.user_id) }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}

                {result.totalPages > 1 && (
                  <SearchPagination
                    currentPage={result.page}
                    totalPages={result.totalPages}
                    filters={filters}
                  />
                )}
              </>
            ) : (
              <EmptyState hasFilters={!isEmptyFilterSet(filters)} />
            )}
          </div>
        </div>

        <SearchAnalytics filters={filters} resultCount={result.totalFull} />
      </main>
    </div>
  );
}

function AnonSignupBanner() {
  return (
    <div className="border-teal/30 bg-teal/5 mb-6 rounded-xl border p-4 text-sm">
      <p className="text-soft-black">
        <Link href="/signup" className="text-teal font-medium hover:underline">
          Create a free account
        </Link>{" "}
        to save nurses, message them, and see full profiles.
      </p>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="border-sage/20 rounded-2xl border bg-white p-10 text-center">
        <h2 className="font-heading text-soft-black text-lg font-medium">
          No nurses match your filters
        </h2>
        <p className="text-soft-black-light mt-2 text-sm">
          Try loosening a filter or two. We&apos;ll add more nurses across Long
          Island as they onboard.
        </p>
        <Link
          href="/nurses"
          className="bg-teal hover:bg-teal-dark mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Clear filters
        </Link>
      </div>
    );
  }
  return (
    <div className="border-sage/20 rounded-2xl border bg-white p-10 text-center">
      <h2 className="font-heading text-soft-black text-lg font-medium">
        No nurses listed yet
      </h2>
      <p className="text-soft-black-light mt-2 text-sm">
        We&apos;re onboarding nurses across New York. Check back soon.
      </p>
    </div>
  );
}
