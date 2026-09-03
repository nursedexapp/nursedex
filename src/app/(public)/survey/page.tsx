import type { Metadata } from "next";
import { Suspense } from "react";
import { SurveyWizard } from "@/components/survey/SurveyWizard";
import { parseSearchParams } from "@/lib/nurses/search-params";
import { getDirectoryFacets } from "@/lib/nurses/facets";

export const metadata: Metadata = {
  title: "Find the right nurse | NurseDex",
  description:
    "Answer a few quick questions and we'll show you matching nurses across New York.",
};

interface SurveyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SurveyPage({ searchParams }: SurveyPageProps) {
  const raw = await searchParams;
  const filters = parseSearchParams(raw);
  const stepRaw = Array.isArray(raw.step) ? raw.step[0] : raw.step;
  const step = Math.min(Math.max(parseInt(stepRaw ?? "1", 10) || 1, 1), 4);

  // The survey's answers become a prefilled directory search, so its options
  // are the directory's own (#766). A failed count is not fatal: the wizard
  // says so and offers the directory rather than asking questions it cannot
  // match anybody against.
  const facets = await getDirectoryFacets().catch((error: unknown) => {
    console.error(
      "[survey] directory facet read failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  });

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <SurveyWizard
            initialFilters={filters}
            initialStep={step}
            facets={facets}
          />
        </Suspense>
      </main>
    </div>
  );
}
