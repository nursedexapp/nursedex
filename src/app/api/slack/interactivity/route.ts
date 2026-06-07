import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { estimateRequest } from "@/lib/ai/estimate";
import { OPS_CHANNEL_ID, slackPost, verifySlackRequest } from "@/lib/slack/client";
import { OPS_NOTIFY_USER_ID } from "@/lib/slack/constants";
import {
  APPROVE_ACTION,
  NEW_REQUEST_ACTION,
  NEW_REQUEST_CALLBACK,
  NEW_REQUEST_SHORTCUT,
  RATES,
  REJECT_ACTION,
  TRIAGE_ACTION,
  TRIAGE_CALLBACK,
  newRequestModalView,
  requestRootBlocks,
  triageModalView,
  type RequestType,
} from "@/lib/slack/views";
import { ensureIssue, getRequest, postReply, refreshRoot } from "@/lib/slack/requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Minimal shapes for the bits of the Slack payload we read.
interface InteractionPayload {
  type: string;
  trigger_id?: string;
  callback_id?: string;
  user: { id: string };
  actions?: { action_id: string; value?: string }[];
  view?: {
    callback_id: string;
    private_metadata?: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            value?: string;
            selected_option?: { value: string } | null;
            selected_date?: string | null;
          }
        >
      >;
    };
  };
}

const ACK = new NextResponse(null, { status: 200 });

// Empty string -> null so optional fields stay clean in the DB.
function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formErrors(errors: Record<string, string>): NextResponse {
  return NextResponse.json({ response_action: "errors", errors });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const valid = verifySlackRequest(
    raw,
    request.headers.get("x-slack-signature"),
    request.headers.get("x-slack-request-timestamp"),
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const encoded = new URLSearchParams(raw).get("payload");
  if (!encoded) return ACK;
  const payload = JSON.parse(encoded) as InteractionPayload;

  // --- Button clicks ----------------------------------------------------
  if (payload.type === "block_actions" && payload.actions?.length) {
    const action = payload.actions[0];

    // Open the intake modal from the New Request button.
    if (action.action_id === NEW_REQUEST_ACTION && payload.trigger_id) {
      await slackPost("views.open", {
        trigger_id: payload.trigger_id,
        view: newRequestModalView(),
      });
      return ACK;
    }

    // Open the triage modal for a specific request, pre-filled with
    // Claude's suggestion if it was computed at intake.
    if (action.action_id === TRIAGE_ACTION && payload.trigger_id) {
      const id = Number(action.value);
      const req = await getRequest(id);
      await slackPost("views.open", {
        trigger_id: payload.trigger_id,
        view: triageModalView({
          id,
          title: req?.title ?? `Request #${id}`,
          suggested_type: req?.suggested_type,
          suggested_estimate_hours: req?.suggested_estimate_hours,
          suggested_rationale: req?.suggested_rationale,
        }),
      });
      return ACK;
    }

    // Approve or reject an ad hoc request.
    if (
      action.action_id === APPROVE_ACTION ||
      action.action_id === REJECT_ACTION
    ) {
      await handleDecision(
        Number(action.value),
        action.action_id === APPROVE_ACTION,
        payload.user.id,
      );
      return ACK;
    }
  }

  // --- Global shortcut -> intake modal ----------------------------------
  if (
    payload.type === "shortcut" &&
    payload.callback_id === NEW_REQUEST_SHORTCUT &&
    payload.trigger_id
  ) {
    await slackPost("views.open", {
      trigger_id: payload.trigger_id,
      view: newRequestModalView(),
    });
    return ACK;
  }

  // --- Modal submissions ------------------------------------------------
  if (payload.type === "view_submission") {
    if (payload.view?.callback_id === NEW_REQUEST_CALLBACK) {
      return handleNewRequest(payload);
    }
    if (payload.view?.callback_id === TRIAGE_CALLBACK) {
      return handleTriage(payload);
    }
  }

  // Unhandled interaction types: acknowledge so Slack does not retry.
  return ACK;
}

// Intake modal submitted -> create the thread and the request row.
async function handleNewRequest(
  payload: InteractionPayload,
): Promise<NextResponse> {
  const v = payload.view!.state.values;
  const title = clean(v.title?.value?.value);
  if (!title) {
    return formErrors({ title: "Please enter a short summary." });
  }
  const fields = {
    title,
    description: clean(v.description?.value?.value),
    urgency: v.urgency?.value?.selected_option?.value ?? null,
    deadline: v.deadline?.value?.selected_date ?? null,
    links: clean(v.links?.value?.value),
    requested_by: payload.user.id,
    status: "submitted",
  };

  try {
    // Post the thread root first to get its timestamp (slack_thread_ts is
    // NOT NULL), then insert, then backfill the request number.
    const posted = await slackPost("chat.postMessage", {
      channel: OPS_CHANNEL_ID,
      text: `New request: ${title}`,
      blocks: requestRootBlocks({ id: 0, ...fields }),
    });
    const ts = posted.ts as string;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("consulting_requests")
      .insert({
        title: fields.title,
        description: fields.description,
        urgency: fields.urgency,
        deadline: fields.deadline,
        links: fields.links,
        slack_channel: OPS_CHANNEL_ID,
        slack_thread_ts: ts,
        requested_by: fields.requested_by,
      })
      .select("id")
      .single();
    if (error) throw error;

    await slackPost("chat.update", {
      channel: OPS_CHANNEL_ID,
      ts,
      text: `Request #${data.id}: ${title}`,
      blocks: requestRootBlocks({ id: data.id, ...fields }),
    });

    // Ping Dan in the thread so a new request does not get missed.
    if (OPS_NOTIFY_USER_ID) {
      await slackPost("chat.postMessage", {
        channel: OPS_CHANNEL_ID,
        thread_ts: ts,
        text: `🔔 <@${OPS_NOTIFY_USER_ID}> new request #${data.id} ready to triage.`,
      });
    }

    // Pre-compute Claude's triage suggestion in the background so the
    // triage modal can pre-fill it. Never blocks the modal close.
    const requestId = data.id;
    after(async () => {
      const est = await estimateRequest({
        title: fields.title,
        description: fields.description,
        links: fields.links,
      });
      if (!est) return;
      const svc = createServiceRoleClient();
      await svc
        .from("consulting_requests")
        .update({
          suggested_estimate_hours: est.hours,
          suggested_type: est.type,
          suggested_rationale: est.rationale,
          suggested_labels: est.labels,
        })
        .eq("id", requestId);
    });

    return ACK;
  } catch (err) {
    console.error("New request submit failed:", err);
    return formErrors({
      title: "Something went wrong creating the request. Try again.",
    });
  }
}

// Triage modal submitted -> set billing type, rate, estimate, and status.
async function handleTriage(
  payload: InteractionPayload,
): Promise<NextResponse> {
  const id = Number(payload.view!.private_metadata);
  const v = payload.view!.state.values;
  const type = v.type?.value?.selected_option?.value as RequestType | undefined;
  const estimate = Number(v.estimate?.value?.value);

  if (!type || !(type in RATES)) {
    return formErrors({ type: "Pick a billing type." });
  }
  if (!Number.isFinite(estimate) || estimate <= 0) {
    return formErrors({ estimate: "Enter a positive number of hours." });
  }

  const rate = RATES[type];
  // Maintenance needs no approval, so it is cleared straight away. Ad hoc
  // waits for the company's approval per the consulting agreement.
  const status = type === "ad_hoc" ? "triaged" : "approved";

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("consulting_requests")
      .update({
        type,
        rate,
        estimate_hours: estimate,
        triaged_by: payload.user.id,
        status,
      })
      .eq("id", id);
    if (error) throw error;

    const req = await getRequest(id);
    if (req) {
      await refreshRoot(req);
      const cost = money(rate * estimate);
      await postReply(
        req,
        type === "ad_hoc"
          ? `🟠 Triaged as *Ad Hoc* at $75/hr, estimate ${estimate} hrs (~${cost}). Awaiting approval before work starts.`
          : `🟢 Triaged as *Maintenance* at $25/hr, estimate ${estimate} hrs (~${cost}). Cleared to start.`,
      );
      // Maintenance is cleared on triage, so open its GitHub issue now.
      if (req.status === "approved") await ensureIssue(req);
    }
    return ACK;
  } catch (err) {
    console.error("Triage submit failed:", err);
    return formErrors({ estimate: "Something went wrong. Try again." });
  }
}

// Approve or reject an ad hoc request awaiting approval.
async function handleDecision(
  id: number,
  approve: boolean,
  userId: string,
): Promise<void> {
  const existing = await getRequest(id);
  if (!existing || existing.status !== "triaged") return; // already decided

  const supabase = createServiceRoleClient();
  const update = approve
    ? { status: "approved", approved_at: new Date().toISOString(), approved_by: userId }
    : { status: "rejected", approved_by: userId };
  const { error } = await supabase
    .from("consulting_requests")
    .update(update)
    .eq("id", id);
  if (error) {
    console.error(`Decision on request ${id} failed:`, error);
    return;
  }

  const req = await getRequest(id);
  if (req) {
    await refreshRoot(req);
    await postReply(
      req,
      approve
        ? `✅ Approved by <@${userId}>. Cleared to start.`
        : `⛔ Rejected by <@${userId}>.`,
    );
    // Open the GitHub issue once an ad hoc request is approved.
    if (approve) await ensureIssue(req);
  }
}
