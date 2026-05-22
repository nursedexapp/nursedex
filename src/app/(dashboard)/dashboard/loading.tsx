import { Skeleton } from "@/components/ui/skeleton";

/**
 * Catch-all skeleton for /dashboard and its subpages (edit, settings,
 * analytics, reviews, saved, revealed, preview). Subpaths can override
 * with their own loading.tsx if a more tailored skeleton is worth it
 * (the wizard at /dashboard/onboarding does this).
 *
 * Renders inside the dashboard layout, so the sidebar nav stays put
 * during the transition; only the main content area is the skeleton.
 *
 * Uses the shared Skeleton (bg-muted) rather than a faint sage tint so
 * the placeholders are actually visible against the warm-white surface.
 */
export default function DashboardLoading() {
  return (
    <div className="px-6 py-8 sm:px-8">
      <Skeleton className="h-4 w-40" />

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
