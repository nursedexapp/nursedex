import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { closeIssue } from "@/lib/github";
import { slackPost } from "@/lib/slack/client";
import { completionBlocks, RATES, type RequestType } from "@/lib/slack/views";
import { getRequest, postReply, refreshRoot } from "@/lib/slack/requests";
import { verifySecretHeader } from "@/lib/security/shared-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return verifySecretHeader(
    request.headers.get("x-admin-secret"),
    process.env.ADMIN_SECRET,
  );
}

// GET /api/slack/track?request_id=14
// Returns context the /done skill needs: the approval time (PR window
// start), rate, status, and title.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("request_id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("consulting_requests")
    .select(
      "id,title,status,type,rate,estimate_hours,approved_at,created_at,slack_thread_ts",
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * The answer for a /done that had nothing left to do: either it arrived after the
 * request was already terminal, or it lost the race to a concurrent /done. Both
 * report the totals that were actually recorded, so a retry still sees success
 * rather than an error for work that did get billed.
 */
async function completedResponse(
  supabase: ServiceClient,
  id: number,
  rate: number,
  status: string,
) {
  const { data: entries } = await supabase
    .from("consulting_time_entries")
    .select("billed_min")
    .eq("request_id", id);
  const totalMin = (entries ?? []).reduce(
    (sum: number, e: { billed_min: number | null }) => sum + (e.billed_min ?? 0),
    0,
  );
  const hrs = totalMin / 60;
  return NextResponse.json({
    ok: true,
    request_id: id,
    already_completed: true,
    status,
    billed_hours: Number(hrs.toFixed(2)),
    cost: Number((rate * hrs).toFixed(2)),
  });
}

interface DonePayload {
  request_id: number;
  billed_min: number;
  wall_clock_min?: number | null;
  active_min?: number | null;
  commit_span_min?: number | null;
  summary: string;
  changelog?: string;
  prs?: { url: string; title?: string }[];
  note?: string;
}

// POST /api/slack/track
// Logs a time entry, marks the request done with its summary and PR links,
// and posts the completion report into the thread.
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DonePayload;
  try {
    body = (await request.json()) as DonePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.request_id);
  const billedMin = Number(body.billed_min);
  if (!Number.isFinite(id) || !Number.isFinite(billedMin) || billedMin < 0) {
    return NextResponse.json(
      { error: "request_id and a non-negative billed_min are required" },
      { status: 400 },
    );
  }
  if (!body.summary?.trim()) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }

  const req = await getRequest(id);
  if (!req) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const prs = body.prs ?? [];
  const rate = req.rate ?? (req.type ? RATES[req.type as RequestType] : 0) ?? 0;
  const supabase = createServiceRoleClient();

  // Fast path: a request that is already terminal is a no-op, and answering here
  // saves a round trip. This is NOT the guard. It used to be, and that was the
  // bug (#663): two /done calls could both read a non-terminal status here, both
  // pass, and both bill. The real gate is inside complete_consulting_request,
  // where the expected status lives in the UPDATE's own WHERE clause.
  if (req.status === "done" || req.status === "invoiced") {
    return completedResponse(supabase, id, rate, req.status);
  }

  // Claim the request and write its billable time entry in ONE transaction. The
  // claim has to be the same statement that excludes the terminal states, and the
  // billing has to ride with it: claiming first in a separate round trip would fix
  // the double-bill but leave a request marked done with no time entry on it if
  // the insert then failed. Either both land or neither does.
  const { data: outcome, error: rpcError } = await supabase.rpc(
    "complete_consulting_request",
    {
      p_request_id: id,
      p_billed_min: Math.round(billedMin),
      p_summary: body.summary.trim(),
      p_pr_urls: prs.map((p) => p.url),
      p_wall_clock_min: body.wall_clock_min ?? null,
      p_active_min: body.active_min ?? null,
      p_commit_span_min: body.commit_span_min ?? null,
      p_note: body.note ?? null,
    },
  );
  if (rpcError) {
    console.error("Completing request failed:", rpcError);
    return NextResponse.json(
      { error: "Failed to complete request" },
      { status: 500 },
    );
  }

  // A concurrent /done got there first. It has already billed the work and posted
  // the report, so this caller must do neither: no second time entry, no second
  // completion post in the thread, no second issue close.
  if (outcome === "already_completed") {
    return completedResponse(supabase, id, rate, "done");
  }

  // Post the completion report and refresh the root to the done state.
  await slackPost("chat.postMessage", {
    channel: req.slack_channel,
    thread_ts: req.slack_thread_ts,
    text: `Request #${id} done`,
    blocks: completionBlocks({
      id,
      title: req.title,
      summary: body.summary.trim(),
      changelog: body.changelog?.trim() || null,
      prs,
      rate,
      billedMin: Math.round(billedMin),
      wallMin: body.wall_clock_min ?? null,
      commitMin: body.commit_span_min ?? null,
    }),
  });
  const fresh = await getRequest(id);
  if (fresh) await refreshRoot(fresh);

  // Close the linked GitHub issue, if one was opened on approval. Run it after
  // the response so a slow GitHub call does not hold up /done, and note a
  // failure in the thread so it is not silent.
  if (req.github_issue_number) {
    const issueNumber = req.github_issue_number;
    after(async () => {
      try {
        await closeIssue(issueNumber);
      } catch (err) {
        console.error(`Closing issue #${issueNumber} failed:`, err);
        await postReply(
          req,
          `Could not auto-close GitHub issue #${issueNumber}. Close it manually.`,
        );
      }
    });
  }

  const billedHrs = billedMin / 60;
  return NextResponse.json({
    ok: true,
    request_id: id,
    billed_hours: Number(billedHrs.toFixed(2)),
    cost: Number((rate * billedHrs).toFixed(2)),
  });
}
