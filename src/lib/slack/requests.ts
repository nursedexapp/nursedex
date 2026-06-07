import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slackPost } from "./client";
import { requestRootBlocks, type RequestView } from "./views";

const ROW_FIELDS =
  "id,title,description,urgency,deadline,links,requested_by,type,rate,estimate_hours,status,approved_by,slack_channel,slack_thread_ts";

export interface RequestRow extends RequestView {
  slack_channel: string;
  slack_thread_ts: string;
}

/** Load a single consulting request row, or null if it is missing. */
export async function getRequest(id: number): Promise<RequestRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("consulting_requests")
    .select(ROW_FIELDS)
    .eq("id", id)
    .single();
  if (error) {
    console.error(`getRequest(${id}) failed:`, error);
    return null;
  }
  return data as RequestRow;
}

/** Re-render the thread root message to reflect the request's current state. */
export async function refreshRoot(req: RequestRow): Promise<void> {
  await slackPost("chat.update", {
    channel: req.slack_channel,
    ts: req.slack_thread_ts,
    text: `Request #${req.id}: ${req.title}`,
    blocks: requestRootBlocks(req),
  });
}

/** Post a short activity line as a reply in the request's thread. */
export async function postReply(req: RequestRow, text: string): Promise<void> {
  await slackPost("chat.postMessage", {
    channel: req.slack_channel,
    thread_ts: req.slack_thread_ts,
    text,
  });
}
