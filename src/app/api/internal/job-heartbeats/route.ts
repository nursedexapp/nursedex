import { NextResponse, type NextRequest } from "next/server";
import { verifyBearerSecret } from "@/lib/security/shared-secret";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import vercelConfig from "../../../../../vercel.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The heartbeats every cron leaves behind, for the watchdog that reads them
 * (#757).
 *
 * The watchdog runs in GitHub Actions rather than as a fourteenth Vercel cron,
 * because a check that runs on the same scheduler as the jobs it watches dies
 * with them and its silence then means nothing. So the rows have to leave the
 * database over HTTP, and this is the only route that does it.
 *
 * WHO MAY CALL IT: anyone holding HEARTBEAT_READ_SECRET, and nobody else. It
 * is its own secret rather than CRON_SECRET or ADMIN_SECRET, both of which can
 * DO things (trigger every cron, reach every admin route) where this needs
 * only to read thirteen timestamps. A missing secret refuses everyone.
 *
 * WHAT IT TOUCHES: the job_heartbeats table and nothing else. Job names,
 * timings, and the counts a run reported. No user data passes through here.
 *
 * IT ALSO REGISTERS jobs it has never seen, which is a write on a read. The
 * grace a job gets before it is called overdue is measured from when it was
 * first seen, and that lives on its row, so a cron with no row gets no grace
 * at all: it is reported as never having completed from the moment it is
 * added until its first run, which for the monthly invoice job is up to a
 * month of daily false alerts. The names come from vercel.json here on the
 * server, never from the caller, so this cannot mint a row for anything that
 * is not actually scheduled.
 */

/** Every cron in vercel.json, named as withCronAlerting names it. */
const SCHEDULED_JOB_NAMES = (vercelConfig.crons ?? []).map((cron) =>
  cron.path.split("/").filter(Boolean).pop(),
) as string[];

interface HeartbeatRow {
  job_name: string;
  first_seen_at?: string | null;
  last_success_at?: string | null;
  last_duration_ms?: number | null;
  last_result?: unknown;
}
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (
    !verifyBearerSecret(
      request.headers.get("authorization"),
      process.env.HEARTBEAT_READ_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("job_heartbeats")
    .select(
      "job_name, first_seen_at, last_success_at, last_duration_ms, last_result",
    );

  // A failed read must never answer 200 with an empty list. The watchdog reads
  // a missing row as "this job has never run", so an empty list from a broken
  // query would accuse every job at once and name the wrong problem (L215).
  if (error) {
    console.error("[job-heartbeats] read failed:", error.message);
    return NextResponse.json(
      { error: `Could not read the job heartbeats: ${error.message}` },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as HeartbeatRow[];
  const known = new Set(rows.map((row) => row.job_name));
  const missing = SCHEDULED_JOB_NAMES.filter((name) => !known.has(name));

  if (missing.length === 0) {
    // An empty list here is a real state, and a different one: it is what a
    // deployment with no crons scheduled at all would look like.
    return NextResponse.json({ jobs: rows });
  }

  const firstSeenAt = new Date().toISOString();
  const { error: writeError } = await supabase.from("job_heartbeats").upsert(
    missing.map((job_name) => ({ job_name, first_seen_at: firstSeenAt })),
    // Two reads can overlap, and the second must not fail on a row the first
    // just created. Ignoring duplicates also protects the first_seen_at of a
    // job that already has one: it must never be moved forward, or the job
    // gets a fresh grace period every time this runs.
    { onConflict: "job_name", ignoreDuplicates: true },
  );

  if (writeError) {
    // The read is what the caller asked for, and the rows that DO exist still
    // have to come back: refusing them would turn a failure to register one
    // new job into a blackout of every job that is running fine.
    console.error("[job-heartbeats] could not register new jobs:", writeError.message);
    return NextResponse.json({ jobs: rows });
  }

  // Returned in the same answer rather than on the next call: a caller that
  // had to ask twice would judge the first answer against a table missing the
  // very jobs this just recorded.
  return NextResponse.json({
    jobs: [
      ...rows,
      ...missing.map((job_name) => ({
        job_name,
        first_seen_at: firstSeenAt,
        last_success_at: null,
        last_duration_ms: null,
        last_result: null,
      })),
    ],
  });
}
