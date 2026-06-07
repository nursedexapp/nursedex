// Block Kit builders for the consulting request flow. Kept as plain
// objects (no SDK) and typed loosely as JSON since Slack accepts any
// valid Block Kit shape.

type Json = Record<string, unknown>;

export const NEW_REQUEST_ACTION = "open_new_request";
export const NEW_REQUEST_CALLBACK = "new_request_submit";

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

/**
 * The formatted request message posted as the thread root. Called once
 * without an id to create the thread, then again with the id to fill in
 * the request number after the row is inserted.
 */
export function requestRootBlocks(opts: {
  id?: number;
  title: string;
  description?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  links?: string | null;
  requestedBy: string;
}): Json[] {
  const heading = opts.id
    ? `:new: Request #${opts.id}: ${opts.title}`
    : `:new: New request: ${opts.title}`;

  const fields: Json[] = [
    { type: "mrkdwn", text: `*Submitted by:*\n<@${opts.requestedBy}>` },
    { type: "mrkdwn", text: `*Status:*\n🟡 Awaiting triage` },
  ];
  if (opts.urgency) {
    fields.push({
      type: "mrkdwn",
      text: `*Urgency:*\n${URGENCY_LABEL[opts.urgency] ?? opts.urgency}`,
    });
  }
  if (opts.deadline) {
    fields.push({ type: "mrkdwn", text: `*Desired by:*\n${opts.deadline}` });
  }

  const blocks: Json[] = [
    { type: "header", text: { type: "plain_text", text: heading.slice(0, 150) } },
    { type: "section", fields },
  ];

  if (opts.description) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Details*\n${opts.description}` },
    });
  }
  if (opts.links) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Links*\n${opts.links}` },
    });
  }

  return blocks;
}
