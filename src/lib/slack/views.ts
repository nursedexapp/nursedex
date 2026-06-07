// Block Kit builders for the consulting request flow. Kept as plain
// objects (no SDK) and typed loosely as JSON since Slack accepts any
// valid Block Kit shape.
import { OPS_CHANNEL_ID } from "./constants";

type Json = Record<string, unknown>;

export const NEW_REQUEST_ACTION = "open_new_request";
export const NEW_REQUEST_CALLBACK = "new_request_submit";
export const NEW_REQUEST_SHORTCUT = "new_request_shortcut";
export const TRIAGE_ACTION = "triage_request";
export const TRIAGE_CALLBACK = "triage_submit";
export const APPROVE_ACTION = "approve_request";
export const REJECT_ACTION = "reject_request";

// Contractual hourly rates by billing type.
export const RATES = { maintenance: 25, ad_hoc: 75 } as const;
export type RequestType = keyof typeof RATES;

// The fields needed to render a request thread root, matching the DB row.
export interface RequestView {
  id: number;
  title: string;
  description?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  links?: string | null;
  requested_by: string;
  type?: string | null;
  rate?: number | null;
  estimate_hours?: number | null;
  status: string;
  approved_by?: string | null;
  github_issue_number?: number | null;
  github_issue_url?: string | null;
  suggested_estimate_hours?: number | null;
  suggested_type?: string | null;
  suggested_rationale?: string | null;
}

/**
 * The persistent "New Request" button the bot posts (and we pin) so Tiana
 * never has to type a command to start a request.
 */
export function newRequestButtonBlocks(): Json[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Need maintenance or a new feature?*\nSubmit a request and it will be triaged, estimated, and tracked here.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "➕ New Request", emoji: true },
          action_id: NEW_REQUEST_ACTION,
        },
      ],
    },
  ];
}

/**
 * The App Home tab: a permanent New Request entry point that never
 * scrolls away, shown when someone opens the NurseDex Ops app.
 */
export function homeView(): Json {
  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "NurseDex Ops", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Submit and track post-build consulting work. New requests are triaged, estimated, and billed in <#" + OPS_CHANNEL_ID + ">.",
        },
      },
      { type: "divider" },
      ...newRequestButtonBlocks(),
    ],
  };
}

/**
 * The intake modal Tiana fills in. Title is required; everything else is
 * optional so the form stays fast.
 */
export function newRequestModalView(): Json {
  return {
    type: "modal",
    callback_id: NEW_REQUEST_CALLBACK,
    title: { type: "plain_text", text: "New Request" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "title",
        label: { type: "plain_text", text: "What do you need?" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: {
            type: "plain_text",
            text: "Short summary, e.g. Add export button to admin",
          },
          max_length: 150,
        },
      },
      {
        type: "input",
        block_id: "description",
        optional: true,
        label: { type: "plain_text", text: "Details" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Anything that helps scope it: what, where, why now.",
          },
        },
      },
      {
        type: "input",
        block_id: "urgency",
        optional: true,
        label: { type: "plain_text", text: "Urgency" },
        element: {
          type: "static_select",
          action_id: "value",
          placeholder: { type: "plain_text", text: "Select urgency" },
          options: [
            { text: { type: "plain_text", text: "Low" }, value: "low" },
            { text: { type: "plain_text", text: "Normal" }, value: "normal" },
            { text: { type: "plain_text", text: "High" }, value: "high" },
            { text: { type: "plain_text", text: "Urgent" }, value: "urgent" },
          ],
        },
      },
      {
        type: "input",
        block_id: "deadline",
        optional: true,
        label: { type: "plain_text", text: "Desired by" },
        element: { type: "datepicker", action_id: "value" },
      },
      {
        type: "input",
        block_id: "links",
        optional: true,
        label: { type: "plain_text", text: "Links or screenshots" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: { type: "plain_text", text: "Paste any relevant URLs" },
        },
      },
    ],
  };
}

const URGENCY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "🔴 Urgent",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "🟡 Awaiting triage",
  triaged: "🟠 Awaiting approval",
  approved: "🟢 Approved, cleared to start",
  rejected: "⛔ Rejected",
  in_progress: "🔵 In progress",
  done: "✅ Done",
  invoiced: "💵 Invoiced",
};

const TYPE_LABEL: Record<string, string> = {
  maintenance: "Maintenance",
  ad_hoc: "Ad Hoc",
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * The formatted request message posted as the thread root. Re-rendered via
 * chat.update on every state change, so the buttons shown follow the
 * request's status: Triage when awaiting triage, Approve/Reject when an ad
 * hoc request is awaiting approval, none otherwise. An id of 0 renders the
 * pre-insert placeholder.
 */
export function requestRootBlocks(req: RequestView): Json[] {
  const heading = req.id
    ? `:clipboard: Request #${req.id}: ${req.title}`
    : `:new: New request: ${req.title}`;

  const fields: Json[] = [
    { type: "mrkdwn", text: `*Submitted by:*\n<@${req.requested_by}>` },
    {
      type: "mrkdwn",
      text: `*Status:*\n${STATUS_LABEL[req.status] ?? req.status}`,
    },
  ];
  if (req.type) {
    const rate = req.rate ?? RATES[req.type as RequestType] ?? 0;
    fields.push({
      type: "mrkdwn",
      text: `*Billing:*\n${TYPE_LABEL[req.type] ?? req.type} (${money(rate)}/hr)`,
    });
  }
  if (req.estimate_hours != null) {
    const rate = req.rate ?? 0;
    fields.push({
      type: "mrkdwn",
      text: `*Estimate:*\n${req.estimate_hours} hrs (~${money(rate * req.estimate_hours)})`,
    });
  }
  if (req.urgency) {
    fields.push({
      type: "mrkdwn",
      text: `*Urgency:*\n${URGENCY_LABEL[req.urgency] ?? req.urgency}`,
    });
  }
  if (req.deadline) {
    fields.push({ type: "mrkdwn", text: `*Desired by:*\n${req.deadline}` });
  }
  if (req.approved_by) {
    const verb = req.status === "rejected" ? "Rejected by" : "Approved by";
    fields.push({ type: "mrkdwn", text: `*${verb}:*\n<@${req.approved_by}>` });
  }
  if (req.github_issue_url) {
    const label = req.github_issue_number
      ? `#${req.github_issue_number}`
      : "view";
    fields.push({
      type: "mrkdwn",
      text: `*Issue:*\n<${req.github_issue_url}|${label}>`,
    });
  }

  const blocks: Json[] = [
    { type: "header", text: { type: "plain_text", text: heading.slice(0, 150) } },
    { type: "section", fields },
  ];

  if (req.description) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Details*\n${req.description}` },
    });
  }
  if (req.links) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Links*\n${req.links}` },
    });
  }

  const elements: Json[] = [];
  if (req.id && req.status === "submitted") {
    elements.push({
      type: "button",
      style: "primary",
      text: { type: "plain_text", text: "Triage" },
      action_id: TRIAGE_ACTION,
      value: String(req.id),
    });
  }
  if (req.id && req.status === "triaged") {
    elements.push(
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        action_id: APPROVE_ACTION,
        value: String(req.id),
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "Reject" },
        action_id: REJECT_ACTION,
        value: String(req.id),
      },
    );
  }
  if (elements.length) blocks.push({ type: "actions", elements });

  return blocks;
}

/**
 * The completion report posted in the thread when a request is marked done:
 * a summary of the work, links to the merged PRs, the hours (billed on
 * active time, with wall clock and commit span shown for transparency), and
 * the computed cost.
 */
export function completionBlocks(opts: {
  id: number;
  title: string;
  summary: string;
  prs: { url: string; title?: string }[];
  rate: number;
  billedMin: number;
  wallMin?: number | null;
  commitMin?: number | null;
}): Json[] {
  const billedHrs = opts.billedMin / 60;
  const cost = opts.rate * billedHrs;

  const blocks: Json[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `✅ Request #${opts.id} done: ${opts.title}`.slice(0, 150),
      },
    },
    { type: "section", text: { type: "mrkdwn", text: opts.summary } },
  ];

  if (opts.prs.length) {
    const list = opts.prs
      .map((p) => `• <${p.url}|${p.title ?? p.url}>`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Merged PRs*\n${list}` },
    });
  }

  const signals: string[] = [`${billedHrs.toFixed(2)} hrs billed (active)`];
  if (opts.wallMin != null) signals.push(`wall ${(opts.wallMin / 60).toFixed(2)}`);
  if (opts.commitMin != null)
    signals.push(`commits ${(opts.commitMin / 60).toFixed(2)}`);

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Hours:* ${signals.join(" · ")}\n*Cost:* ${money(cost)} at ${money(opts.rate)}/hr`,
    },
  });

  return blocks;
}

/**
 * The triage modal Dan fills in: billing type (which sets the rate) and an
 * hour estimate. The request id rides in private_metadata so the submit
 * handler knows which request to update. When Claude has pre-computed a
 * suggestion at intake, the type is pre-selected and the hours pre-filled
 * (both still editable), with the rationale shown as context.
 */
export function triageModalView(req: {
  id: number;
  title: string;
  suggested_type?: string | null;
  suggested_estimate_hours?: number | null;
  suggested_rationale?: string | null;
}): Json {
  const typeOptions = [
    {
      text: { type: "plain_text", text: "Maintenance ($25/hr)" },
      value: "maintenance",
    },
    {
      text: { type: "plain_text", text: "Ad Hoc ($75/hr)" },
      value: "ad_hoc",
    },
  ];

  const typeElement: Json = {
    type: "static_select",
    action_id: "value",
    placeholder: { type: "plain_text", text: "Select billing type" },
    options: typeOptions,
  };
  const suggestedOption = typeOptions.find(
    (o) => o.value === req.suggested_type,
  );
  if (suggestedOption) typeElement.initial_option = suggestedOption;

  const estimateElement: Json = {
    type: "plain_text_input",
    action_id: "value",
    placeholder: { type: "plain_text", text: "e.g. 3.5" },
  };
  if (req.suggested_estimate_hours != null) {
    estimateElement.initial_value = String(req.suggested_estimate_hours);
  }

  const blocks: Json[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Request #${req.id}:* ${req.title}` },
    },
  ];
  if (req.suggested_rationale) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `✨ *Suggested by Claude:* ${req.suggested_rationale}`,
        },
      ],
    });
  }
  blocks.push(
    {
      type: "input",
      block_id: "type",
      label: { type: "plain_text", text: "Billing type" },
      element: typeElement,
    },
    {
      type: "input",
      block_id: "estimate",
      label: { type: "plain_text", text: "Estimated hours" },
      element: estimateElement,
    },
  );

  return {
    type: "modal",
    callback_id: TRIAGE_CALLBACK,
    private_metadata: String(req.id),
    title: { type: "plain_text", text: "Triage" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}
