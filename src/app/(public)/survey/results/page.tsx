import type { Metadata } from "next";
import Link from "next/link";
import { SurveyResultCard } from "@/components/survey/SurveyResultCard";
import { SurveyResultsAnalytics } from "@/components/survey/SurveyResultsAnalytics";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { searchNurses } from "@/lib/nurses/search";
import { logSearchGap } from "@/lib/nurses/search-gap";
import {
  parseSearchParams,
  toURLSearchParams,
} from "@/lib/nurses/search-params";

const ZERO_RESULTS_THRESHOLD = 3;

export const metadata: Metadata = {
  title: "Your matches | NurseDex",
  description: "Nurses matching what you're looking for, across New York.",
};

interface ResultsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SurveyResultsPage({
  searchParams,
}: ResultsPageProps) {
  const raw = await searchParams;
  const filters = parseSearchParams(raw);

  // First pass, strict filters
  const result = await searchNurses({
    filters,
    viewerZip: filters.zip ?? null,
    viewerCommPref: null,
  });

  const isLowResult = result.totalFull < ZERO_RESULTS_THRESHOLD;

  // Log the survey-driven gap so we can spot care types we under-serve.
  if (isLowResult) {
    logSearchGap(filters, result.totalFull);
  }

  // If a family is logged in and reached results, mark survey_completed so
  // the dashboard prompt stops appearing. Fire-and-forget; failures don't
  // block the page.
  const viewer = await getCurrentUser();
  if (viewer?.role === "family") {
    const supabase = await createClient();
    await supabase
      .from("family_profiles")
      .update({ survey_completed: true })
      .eq("user_id", viewer.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  // For "browse all nurses" we want the same filter set, minus pagination.
  const browseHref = (() => {
    const params = toURLSearchParams({ ...filters, page: 1 });
    const q = params.toString();
    return q ? `/nurses?${q}` : "/nurses";
  })();

  // For signup we hand back the filters so the post-signup flow can pick
  // them up (used by Phase 3 Batch 3's "We applied your preferences" prompt
  //, for now, the params just round-trip through signup).
  const signupHref = (() => {
    const params = toURLSearchParams({ ...filters, page: 1 });
    const q = params.toString();
    return q ? `/signup?survey=${encodeURIComponent(q)}` : "/signup";
  })();

  // Combine items + partials for the partial-card view; survey results don't
  // need the strict/partial distinction the search page makes.
  const cards = [...result.items, ...result.partials];
  const hasResults = cards.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 space-y-2 text-center">
          <p className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
            Your survey results
          </p>
          <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
            {hasResults
              ? isLowResult
                ? "We're still building inventory in your area"
                : `${result.totalFull} nurse${result.totalFull === 1 ? "" : "s"} match what you're looking for`
              : "No matches yet"}
          </h1>
          <p className="text-soft-black-light text-sm">
            {hasResults
              ? isLowResult
                ? "These are the closest fits for now. We add new nurses and aides every week."
                : "Create a free account to see full profiles, contact info, and save your favorites."
              : "We don't have anyone matching every filter yet. Try loosening a filter, or sign up to be notified when matching nurses join."}
          </p>
        </div>

        {hasResults && (
          <div className="mb-8 flex flex-col items-center gap-3">
            <Link
              href={signupHref}
              className="bg-teal hover:bg-teal-dark inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
            >
              Create a free account to see full profiles
            </Link>
            <Link
              href={browseHref}
              className="text-soft-black-light hover:text-soft-black text-sm underline-offset-4 hover:underline"
            >
              Or browse all nurses
            </Link>
          </div>
        )}

        {hasResults ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((nurse) => (
              <SurveyResultCard
                key={nurse.user_id}
                nurse={nurse}
                signupHref={signupHref}
                dimmed={
                  // Visually mark partial fallbacks
                  result.partials.some((p) => p.user_id === nurse.user_id)
                }
              />
            ))}
          </div>
        ) : (
          <div className="border-sage/20 mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-8 text-center">
            <p className="text-soft-black-light text-sm">
              Try adjusting one of your filters, or join the waitlist and
              we&apos;ll notify you when matching nurses are available.
            </p>
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/survey"
                className="bg-teal hover:bg-teal-dark inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
              >
                Adjust your survey
              </Link>
              <Link
                href="/signup"
                className="text-soft-black-light hover:text-soft-black text-sm underline-offset-4 hover:underline"
              >
                Or sign up to be notified
              </Link>
            </div>
          </div>
        )}

        <SurveyResultsAnalytics
          filters={filters}
          resultCount={result.totalFull}
        />
      </main>
    </div>
  );
}
