import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { SurveyWizard } from "@/components/survey/SurveyWizard";
import { parseSearchParams } from "@/lib/nurses/search-params";

export const metadata: Metadata = {
  title: "Find the right nurse | NurseDex",
  description:
    "Answer a few quick questions and we'll show you matching nurses on Long Island.",
};

interface SurveyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SurveyPage({ searchParams }: SurveyPageProps) {
  const raw = await searchParams;
  const filters = parseSearchParams(raw);
  const stepRaw = Array.isArray(raw.step) ? raw.step[0] : raw.step;
  const step = Math.min(Math.max(parseInt(stepRaw ?? "1", 10) || 1, 1), 4);

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <SurveyWizard initialFilters={filters} initialStep={step} />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
