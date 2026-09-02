import { NextResponse, type NextRequest } from "next/server";
import { verifyBearerSecret } from "@/lib/security/shared-secret";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
 */
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

  // An empty list here is a real state, and a different one: it is what a
  // deployment before the first cron run looks like.
  return NextResponse.json({ jobs: data ?? [] });
}
