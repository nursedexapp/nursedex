import type { Metadata } from "next";
import Link from "next/link";
import { NurseCard } from "@/components/nurses/NurseCard";
import { FilterChipRow } from "@/components/nurses/FilterChipRow";
import { SearchAnalytics } from "@/components/nurses/SearchAnalytics";
import { ResultsSummary } from "@/components/nurses/ResultsSummary";
import { SearchPagination } from "@/components/nurses/SearchPagination";
import { SurveyAppliedBanner } from "@/components/nurses/SurveyAppliedBanner";
import { SavedListUnavailableNotice } from "@/components/nurses/SavedListUnavailableNotice";
import { UnlocatableZipNotice } from "@/components/nurses/UnlocatableZipNotice";
import { getCurrentUser } from "@/lib/auth/helpers";
import { searchNurses } from "@/lib/nurses/search";
import { getAllSavedNurseIds, getSavedNurseIds } from "@/lib/nurses/saves";
import { getRevealedNurseIds } from "@/lib/reveals/queries";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";
import { logSearchGap } from "@/lib/nurses/search-gap";
import {
  parseSearchParams,
  isEmptyFilterSet,
  toURLSearchParams,
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

  // The zip the family typed is the one the box on screen is labelled with, so
  // it is the one distances are measured from. searchNurses derives that; this
  // page hands it only the profile zip to fall back to (#769).
  const viewerZip = user?.zip_code ?? null;
  const viewerCommPref = user?.communication_preference ?? null;

  // Save/reveal state only applies to family viewers.
  const showSaves = user?.role === "family";

  // Subscription state gates whether last names are even present in the
  // cards (#381), so it must be known before the search runs, not alongside
  // it: searchNurses strips last_name unless the viewer is entitled, and a
  // stripped card cannot be un-stripped afterward. The reveal-id lookup only
  // annotates results, so it stays parallel with the (cheap, indexed) sub
  // check. A subscribed family sees every nurse's last name.
  // The saved set comes from the SESSION, never from the URL. The flag in the
  // URL only says whether to constrain (#776).
  const [viewerRevealedIds, hasSub, viewerSavedIds] = await Promise.all([
    showSaves && user
      ? getRevealedNurseIds(user.id)
      : Promise.resolve(undefined),
    showSaves && user ? hasActiveFamilyAccess(user.id) : Promise.resolve(false),
    showSaves && user
      ? getAllSavedNurseIds(user.id)
      : Promise.resolve(undefined),
  ]);

  const result = await searchNurses({
    filters,
    viewerZip,
    viewerCommPref,
    viewerCanSeeIdentity: hasSub,
    // Signed in of any role, not just a subscribing family: bio, rate and
    // availability are the free tier's reason to create an account (#773).
    viewerIsSignedIn: !!user,
    // null means the list could not be read. Passing undefined leaves the
    // search unconstrained, which is why the page has to say so below.
    viewerSavedIds: viewerSavedIds ?? undefined,
  });

  // The family asked for Saved only and we could not read their list, so the
  // results they are looking at are not limited to their saves.
  const savedFilterNotApplied = filters.saved && viewerSavedIds === null;
  const withoutSavedHref = (() => {
    const query = toURLSearchParams({
      ...filters,
      saved: false,
      page: 1,
    }).toString();
    return query ? `/nurses?${query}` : "/nurses";
  })();

  if (viewerRevealedIds && viewerRevealedIds.size > 0) {
    for (const c of result.items) c.revealed = viewerRevealedIds.has(c.user_id);
    for (const c of result.partials)
      c.revealed = viewerRevealedIds.has(c.user_id);
  }

  const savedIds =
    viewerSavedIds ??
    (showSaves
      ? await getSavedNurseIds([
          ...result.items.map((n) => n.user_id),
          ...result.partials.map((n) => n.user_id),
        ])
      : new Set<string>());

  // Log low-result searches so we can spot care-type gaps later.
  // Fire-and-forget, never block render.
  if (!isEmptyFilterSet(filters) && result.totalFull < 5) {
    logSearchGap(filters, result.totalFull);
  }

  const totalShown = result.items.length + result.partials.length;
  const hasResults = totalShown > 0;

  return (
    <div className="flex flex-1 flex-col">
      <main className="max-w-site mx-auto w-full flex-1 px-4 py-8 sm:px-6">
        <div className="mb-5">
          <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
            Find a Nurse
          </h1>
          <div className="mt-1">
            <ResultsSummary result={result} />
          </div>
        </div>

        <div className="mb-6">
          <FilterChipRow
            filters={filters}
            savedCount={viewerSavedIds ? viewerSavedIds.size : null}
          />
        </div>

        <div>
          <div className="min-w-0">
            {fromSurvey && <SurveyAppliedBanner />}
            <SavedListUnavailableNotice
              show={savedFilterNotApplied}
              withoutSavedHref={withoutSavedHref}
            />
            <UnlocatableZipNotice
              zip={result.unlocatableZip}
              hadDistanceFilter={filters.distance !== undefined}
            />
            {!user && hasResults && <AnonSignupBanner />}

            {hasResults ? (
              <>
                {result.items.length > 0 && (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {result.items.map((nurse) => (
                      <NurseCard
                        key={nurse.user_id}
                        nurse={nurse}
                        showLastName={hasSub}
                        saveState={
                          showSaves
                            ? {
                                isSaved: savedIds.has(nurse.user_id),
                                inSavedOnlyView: filters.saved,
                              }
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
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {result.partials.map((nurse) => (
                        <NurseCard
                          key={`partial-${nurse.user_id}`}
                          nurse={nurse}
                          dimmed
                          showLastName={hasSub}
                          saveState={
                            showSaves
                              ? {
                                  isSaved: savedIds.has(nurse.user_id),
                                  inSavedOnlyView: filters.saved,
                                }
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
              <EmptyState
                hasFilters={!isEmptyFilterSet(filters)}
                savedOnlyWithNoSaves={
                  filters.saved && viewerSavedIds?.size === 0
                }
              />
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
        {/* teal-dark, not teal: on this tinted panel the lighter one measures
            4.36:1 on the rendered page, under the 4.5:1 text floor (#778). */}
        <Link
          href="/signup"
          className="text-teal-dark font-medium hover:underline"
        >
          Create a free account
        </Link>{" "}
        to save nurses, message them, and see full profiles.
      </p>
    </div>
  );
}

function EmptyState({
  hasFilters,
  savedOnlyWithNoSaves,
}: {
  hasFilters: boolean;
  savedOnlyWithNoSaves?: boolean;
}) {
  // A family with zero saves would otherwise be told "we're onboarding nurses
  // across New York", which is both untrue for them and offers no way to clear
  // the chip that is hiding every nurse (#776).
  if (savedOnlyWithNoSaves) {
    return (
      <div className="border-sage/20 rounded-2xl border bg-white p-10 text-center">
        <h2 className="font-heading text-soft-black text-lg font-medium">
          You haven&apos;t saved any nurses yet
        </h2>
        <p className="text-soft-black-light mt-2 text-sm">
          Tap the heart on any nurse to keep them here. Turn off Saved only to
          go back to browsing everyone.
        </p>
        <Link
          href="/nurses"
          className="bg-teal hover:bg-teal-dark mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Show all nurses
        </Link>
      </div>
    );
  }

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
