/**
 * Catch-all skeleton for /dashboard and its subpages (edit, settings,
 * analytics, reviews, saved, revealed, preview). Subpaths can override
 * with their own loading.tsx if a more tailored skeleton is worth it
 * (the wizard at /dashboard/onboarding does this).
 *
 * Renders inside the dashboard layout, so the sidebar nav stays put
 * during the transition; only the main content area is the skeleton.
 */
export default function DashboardLoading() {
  return (
    <div className="px-6 py-8 sm:px-8">
      <div className="bg-sage/15 h-4 w-40 animate-pulse rounded" />

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <div className="bg-sage/10 h-32 w-full animate-pulse rounded-lg" />
        <div className="bg-sage/10 h-24 w-full animate-pulse rounded-lg" />
        <div className="bg-sage/10 h-24 w-full animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
