import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createIssue, ISSUE_LABELS } from "@/lib/github";
import { slackPost } from "./client";
import {
  RATES,
  requestRootBlocks,
  type RequestType,
  type RequestView,
} from "./views";

import { assertNoWriteError } from "@/lib/db/results";
const ROW_FIELDS =
  "id,title,description,urgency,deadline,links,requested_by,type,rate,estimate_hours,status,approved_by,github_issue_number,github_issue_url,suggested_estimate_hours,suggested_type,suggested_rationale,suggested_labels,slack_channel,slack_thread_ts";

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

  const supabase = createServiceRoleClient();

  // Claim the right to create the issue BEFORE calling GitHub (#663). The check
  // above is only a cheap early-out: on its own it was the whole guard, and the
  // gap between it and the write below is a network round trip to GitHub, so a
  // double-clicked Approve created two issues for one request. Whoever moves this
  // column off NULL owns the creation; everyone else stops here.
  const { data: claimed, error: claimError } = await supabase
    .from("consulting_requests")
    .update({ github_issue_claimed_at: new Date().toISOString() })
    .eq("id", req.id)
    .is("github_issue_claimed_at", null)
    .select("id");
  if (claimError) {
    console.error(`Claiming issue creation for ${req.id} failed:`, claimError);
    return;
  }
  if (!claimed || claimed.length === 0) {
    // A concurrent caller is creating it, or already has.
    return;
  }

  /** Hand the claim back so a later attempt can retry a creation that failed. */
  const releaseClaim = async () => {
    // Checked: this write is what lets a later attempt retry a creation that
    // failed, so an unchecked failure here leaves the claim held forever and
    // the request is never picked up again (#847).
    await assertNoWriteError(
      supabase
        .from("consulting_requests")
        .update({ github_issue_claimed_at: null })
        .eq("id", req.id),
      "the release of a GitHub issue claim",
    );
  };

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

  // Always-on `consulting` label plus Claude's suggested labels (filtered
  // to known repo labels), deduped.
  const allowed = new Set<string>(ISSUE_LABELS);
  const labels = Array.from(
    new Set([
      "consulting",
      ...(req.suggested_labels ?? []).filter((l) => allowed.has(l)),
    ]),
  );

  let issue;
  try {
    issue = await createIssue({
      title: `Request #${req.id}: ${req.title}`.slice(0, 256),
      body: lines.join("\n"),
      labels,
    });
  } catch (err) {
    console.error(`createIssue for request ${req.id} failed:`, err);
    // Nothing was created, so give the claim back rather than wedging the request
    // in a state where no attempt can ever open its issue.
    await releaseClaim();
    // Surface the failure in the thread so a missing issue is not silent.
    await postReply(
      req,
      `Could not create a GitHub issue for request #${req.id} automatically. Create one manually and link it here.`,
    );
    return;
  }

  // The issue EXISTS on GitHub by now. An unchecked failure here loses the only
  // link back to it, and the claim stays held, so nothing retries and nothing
  // says why (#847).
  await assertNoWriteError(
    supabase
      .from("consulting_requests")
      .update({
        github_issue_number: issue.number,
        github_issue_url: issue.html_url,
      })
      .eq("id", req.id),
    "the GitHub issue link on a consulting request",
  );

  const fresh = await getRequest(req.id);
  if (fresh) {
    await refreshRoot(fresh);
    await postReply(
      fresh,
      `GitHub issue created: <${issue.html_url}|#${issue.number}>`,
    );
  }
}
