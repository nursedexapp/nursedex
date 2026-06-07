import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createIssue } from "@/lib/github";
import { slackPost } from "./client";
import { RATES, requestRootBlocks, type RequestType, type RequestView } from "./views";

const ROW_FIELDS =
  "id,title,description,urgency,deadline,links,requested_by,type,rate,estimate_hours,status,approved_by,github_issue_number,github_issue_url,slack_channel,slack_thread_ts";

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

/**
 * Open a GitHub issue for a request the first time it becomes workable, store
 * the issue on the row, surface it on the card, and note it in the thread.
 * Idempotent: a request that already has an issue is left untouched.
 */
export async function ensureIssue(req: RequestRow): Promise<void> {
  if (req.github_issue_url) return;

  // Best-effort permalink so the issue points back at the Slack thread.
  let permalink = "";
  try {
    const r = await slackPost("chat.getPermalink", {
      channel: req.slack_channel,
      message_ts: req.slack_thread_ts,
    });
    permalink = (r.permalink as string) ?? "";
  } catch (err) {
    console.error("getPermalink failed:", err);
  }

  const rate = req.rate ?? (req.type ? RATES[req.type as RequestType] : 0) ?? 0;
  const lines = [
    req.description ? `${req.description}\n` : "",
    `**Billing:** ${req.type === "ad_hoc" ? "Ad Hoc" : "Maintenance"} ($${rate}/hr)`,
    req.estimate_hours != null ? `**Estimate:** ${req.estimate_hours} hrs` : "",
    req.urgency ? `**Urgency:** ${req.urgency}` : "",
    req.deadline ? `**Desired by:** ${req.deadline}` : "",
    req.links ? `**Links:** ${req.links}` : "",
    permalink ? `\n[Slack thread](${permalink})` : "",
    `\n_NurseDex consulting request #${req.id}._`,
  ].filter(Boolean);

  let issue;
  try {
    issue = await createIssue({
      title: `Request #${req.id}: ${req.title}`.slice(0, 256),
      body: lines.join("\n"),
      labels: ["consulting"],
    });
  } catch (err) {
    console.error(`createIssue for request ${req.id} failed:`, err);
    return;
  }

  const supabase = createServiceRoleClient();
  await supabase
    .from("consulting_requests")
    .update({
      github_issue_number: issue.number,
      github_issue_url: issue.html_url,
    })
    .eq("id", req.id);

  const fresh = await getRequest(req.id);
  if (fresh) {
    await refreshRoot(fresh);
    await postReply(
      fresh,
      `📌 GitHub issue created: <${issue.html_url}|#${issue.number}>`,
    );
  }
}
