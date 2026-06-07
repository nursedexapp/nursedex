import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { OPS_CHANNEL_ID, slackPost, verifySlackRequest } from "@/lib/slack/client";
import {
  NEW_REQUEST_ACTION,
  NEW_REQUEST_CALLBACK,
  NEW_REQUEST_SHORTCUT,
  newRequestModalView,
  requestRootBlocks,
} from "@/lib/slack/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Minimal shapes for the bits of the Slack payload we read.
interface InteractionPayload {
  type: string;
  trigger_id?: string;
  callback_id?: string;
  user: { id: string };
  actions?: { action_id: string }[];
  view?: {
    callback_id: string;
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

// Empty string -> null so optional fields stay clean in the DB.
function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
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
  if (!encoded) return new NextResponse(null, { status: 200 });
  const payload = JSON.parse(encoded) as InteractionPayload;

  // 1. Open the intake modal, triggered by either the New Request button
  // (block_actions), the App Home button, or the global shortcut.
  const fromButton =
    payload.type === "block_actions" &&
    payload.actions?.some((a) => a.action_id === NEW_REQUEST_ACTION);
  const fromShortcut =
    payload.type === "shortcut" && payload.callback_id === NEW_REQUEST_SHORTCUT;
  if ((fromButton || fromShortcut) && payload.trigger_id) {
    await slackPost("views.open", {
      trigger_id: payload.trigger_id,
      view: newRequestModalView(),
    });
    return new NextResponse(null, { status: 200 });
  }

  // 2. Intake modal submitted -> create the thread and the request row.
  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === NEW_REQUEST_CALLBACK
  ) {
    const v = payload.view.state.values;
    const title = clean(v.title?.value?.value);
    if (!title) {
      return NextResponse.json({
        response_action: "errors",
        errors: { title: "Please enter a short summary." },
      });
    }
    const fields = {
      title,
      description: clean(v.description?.value?.value),
      urgency: v.urgency?.value?.selected_option?.value ?? null,
      deadline: v.deadline?.value?.selected_date ?? null,
      links: clean(v.links?.value?.value),
      requestedBy: payload.user.id,
    };

    try {
      // Post the thread root first to get its timestamp (slack_thread_ts
      // is NOT NULL), then insert, then backfill the request number.
      const posted = await slackPost("chat.postMessage", {
        channel: OPS_CHANNEL_ID,
        text: `New request: ${title}`,
        blocks: requestRootBlocks(fields),
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
          requested_by: fields.requestedBy,
        })
        .select("id")
        .single();
      if (error) throw error;

      await slackPost("chat.update", {
        channel: OPS_CHANNEL_ID,
        ts,
        text: `Request #${data.id}: ${title}`,
        blocks: requestRootBlocks({ ...fields, id: data.id }),
      });

      return new NextResponse(null, { status: 200 });
    } catch (err) {
      console.error("New request submit failed:", err);
      return NextResponse.json({
        response_action: "errors",
        errors: { title: "Something went wrong creating the request. Try again." },
      });
    }
  }

  // Unhandled interaction types: acknowledge so Slack does not retry.
  return new NextResponse(null, { status: 200 });
}
