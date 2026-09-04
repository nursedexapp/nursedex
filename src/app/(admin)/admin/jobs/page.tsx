import type { Metadata } from "next";
import { getJobHealth } from "@/lib/admin/job-health";
import { JobHealthTable } from "./JobHealthTable";

export const metadata: Metadata = {
  title: "Scheduled jobs | NurseDex Admin",
  robots: { index: false, follow: false },
};

// The whole point is when each job last ran, so never serve a cached render.
export const dynamic = "force-dynamic";

/**
 * Is everything running (#888).
 *
 * Guarded by (admin)/layout, like every other page in this section.
 *
 * The data comes from `job_heartbeats`, which every cron already writes, and
 * the staleness rule is the watchdog's own. If the read fails, getJobHealth
 * throws and the admin error boundary takes over: a page that answered "no
 * jobs, no problems" would be the most reassuring possible rendering of a
 * broken database connection.
 */
export default async function AdminJobsPage() {
  const health = await getJobHealth();

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Scheduled jobs
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Every cron this deployment schedules, and when each one last got
          through. The daily Job Watchdog alerts on the same rule this page
          shows, so a job marked overdue here is one it would page about.
        </p>
      </header>

      <JobHealthTable health={health} />
    </div>
  );
}
