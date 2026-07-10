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

  // Idempotency guard: once a request is done or invoiced, /done is a no-op.
  // Re-running must not log a second time entry (double counting the invoice),
  // revert an invoiced request to done, re-post the completion report (thread
  // clutter), or re-close the issue. Return the already-recorded totals so a
  // retry still sees success.
  if (req.status === "done" || req.status === "invoiced") {
    const { data: entries } = await supabase
      .from("consulting_time_entries")
      .select("billed_min")
      .eq("request_id", id);
    const totalMin = (entries ?? []).reduce(
      (sum, e) => sum + (e.billed_min ?? 0),
      0,
    );
    const hrs = totalMin / 60;
    return NextResponse.json({
      ok: true,
      request_id: id,
      already_completed: true,
      status: req.status,
      billed_hours: Number(hrs.toFixed(2)),
      cost: Number((rate * hrs).toFixed(2)),
    });
  }

  const { error: entryError } = await supabase
    .from("consulting_time_entries")
    .insert({
      request_id: id,
      wall_clock_min: body.wall_clock_min ?? null,
      active_min: body.active_min ?? null,
      commit_span_min: body.commit_span_min ?? null,
      billed_min: Math.round(billedMin),
      note: body.note ?? null,
    });
  if (entryError) {
    console.error("Time entry insert failed:", entryError);
    return NextResponse.json({ error: "Failed to log time" }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("consulting_requests")
    .update({
      status: "done",
      summary: body.summary.trim(),
      pr_urls: prs.map((p) => p.url),
    })
    .eq("id", id);
  if (updateError) {
    console.error("Request update failed:", updateError);
    return NextResponse.json(
      { error: "Failed to update request" },
      { status: 500 },
    );
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
