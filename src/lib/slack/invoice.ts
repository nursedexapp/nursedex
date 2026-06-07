import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { OPS_CHANNEL_ID } from "./constants";
import { slackPost } from "./client";

// Monthly invoice rollup: total each month's billed hours per request and
// post a summary in the channel. Read-only (does not mutate status).

type Json = Record<string, unknown>;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface EntryRow {
  billed_min: number | null;
  request:
    | { id: number; title: string; rate: number | null; type: string | null }
    | { id: number; title: string; rate: number | null; type: string | null }[]
    | null;
}

/**
 * Build and post the invoice for a month ("YYYY-MM"). Groups time entries
 * by request, shows hours and cost per request, and a grand total.
 */
export async function generateAndPostInvoice(
  month: string,
): Promise<{ total: number; lines: number }> {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("consulting_time_entries")
    .select("billed_min,request:consulting_requests(id,title,rate,type)")
    .gte("work_date", start)
    .lt("work_date", end);
  if (error) throw error;

  // Group billed minutes by request.
  const byReq = new Map<
    number,
    { title: string; rate: number; minutes: number }
  >();
  for (const row of (data ?? []) as EntryRow[]) {
    const req = Array.isArray(row.request) ? row.request[0] : row.request;
    if (!req) continue;
    const cur = byReq.get(req.id) ?? {
      title: req.title,
      rate: req.rate ?? 0,
      minutes: 0,
    };
    cur.minutes += row.billed_min ?? 0;
    byReq.set(req.id, cur);
  }

  const blocks: Json[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🧾 Invoice — ${monthLabel}` },
    },
  ];

  let total = 0;
  const fields: Json[] = [];
  for (const [id, r] of [...byReq.entries()].sort((a, b) => a[0] - b[0])) {
    const hrs = r.minutes / 60;
    const cost = r.rate * hrs;
    total += cost;
    fields.push({
      type: "mrkdwn",
      text: `*#${id}* ${r.title}\n${hrs.toFixed(2)} hrs × ${money(r.rate)} = *${money(cost)}*`,
    });
  }

  if (!fields.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `No billable hours logged in ${monthLabel}.`,
      },
    });
  } else {
    // Slack allows at most 10 fields per section.
    for (let i = 0; i < fields.length; i += 10) {
      blocks.push({ type: "section", fields: fields.slice(i, i + 10) });
    }
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Total for ${monthLabel}: ${money(total)}*`,
      },
    });
  }

  await slackPost("chat.postMessage", {
    channel: OPS_CHANNEL_ID,
    text: `Invoice — ${monthLabel}: ${money(total)}`,
    blocks,
  });

  return { total: Number(total.toFixed(2)), lines: fields.length };
}
