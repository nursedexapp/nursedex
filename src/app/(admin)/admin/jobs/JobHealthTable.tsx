import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { JobHealth, JobHealthRow, JobStatus } from "@/lib/admin/job-health";
import { humanize } from "@/lib/cron/schedule-health";

/**
 * One row per scheduled job (#888).
 *
 * The expected interval sits beside the last run on purpose, so a stale job is
 * obvious without the reader doing arithmetic in their head.
 *
 * Every status carries a word as well as a colour and an icon. Colour alone
 * would leave the one thing this page exists to say unreadable to anyone who
 * cannot separate the greens from the ambers.
 */

const STATUS: Record<
  JobStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "On schedule",
    className: "text-teal",
    icon: CheckCircle2,
  },
  overdue: {
    label: "Overdue",
    className: "text-destructive",
    icon: AlertTriangle,
  },
  "never-ran": {
    label: "Not yet run",
    className: "text-soft-black-light",
    icon: CircleDashed,
  },
};

export function JobHealthTable({ health }: { health: JobHealth }) {
  const overdue = health.rows.filter((r) => r.status === "overdue").length;

  return (
    <Card className="border-sage/20">
      <CardContent className="p-0">
        <div
          className="border-sage/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          data-testid="job-health-summary"
        >
          <p className="text-soft-black text-sm font-medium">
            {summary(health.rows.length, overdue)}
          </p>
          <p className="text-soft-black-light text-xs">
            Read {new Date(health.checkedAt).toUTCString()}
          </p>
        </div>

        {/* Wide content scrolls inside its own container rather than making
            the page scroll sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-soft-black-light border-sage/20 border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Job
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Last success
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Runs every
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Took
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Reported
                </th>
              </tr>
            </thead>
            <tbody>
              {health.rows.map((row) => (
                <Row key={row.name} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ row }: { row: JobHealthRow }) {
  const status = STATUS[row.status];
  const Icon = status.icon;

  return (
    <tr className="border-sage/10 border-b last:border-0">
      <td className="text-soft-black px-4 py-2.5 font-medium">
        {row.name}
        <span className="text-soft-black-light block font-mono text-xs">
          {row.path}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center gap-1.5 ${status.className}`}>
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {status.label}
        </span>
      </td>
      <td className="text-soft-black-light px-4 py-2.5">
        {row.lastSuccessAt && row.ageMs !== null ? (
          <>
            {humanize(row.ageMs)} ago
            <span className="block text-xs">
              {new Date(row.lastSuccessAt).toUTCString()}
            </span>
          </>
        ) : (
          "Never"
        )}
      </td>
      <td className="text-soft-black-light px-4 py-2.5">
        {humanize(row.intervalMs)}
      </td>
      <td className="text-soft-black-light px-4 py-2.5">
        {row.lastDurationMs === null
          ? "Not recorded"
          : `${(row.lastDurationMs / 1000).toFixed(1)}s`}
      </td>
      <td className="text-soft-black-light max-w-xs truncate px-4 py-2.5 font-mono text-xs">
        {row.lastResult === null ? "Nothing" : JSON.stringify(row.lastResult)}
      </td>
    </tr>
  );
}

/**
 * Says which of the three things is true, in words. "13 jobs" alone would read
 * the same whether every one of them was healthy or every one had stopped.
 */
function summary(total: number, overdue: number): string {
  const jobs = total === 1 ? "job" : "jobs";

  if (total === 0) {
    return "No scheduled jobs found, which is itself a problem: this deployment should have some.";
  }
  if (overdue === 0) {
    const areIs = total === 1 ? "is" : "are";
    return `All ${total} scheduled ${jobs} ${areIs} running on time.`;
  }

  const isAre = overdue === 1 ? "is" : "are";
  return `${overdue} of ${total} scheduled ${jobs} ${isAre} overdue.`;
}
