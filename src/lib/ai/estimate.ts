import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ISSUE_LABELS } from "@/lib/github";

// Ask Claude for a rough billing type + hour estimate from a request
// description, used to pre-fill the triage modal. Raw fetch (matching the
// Slack and GitHub helpers) so no SDK dependency. Returns null on any
// failure so intake never breaks if the estimate is unavailable.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

// Pull recent triaged requests as few-shot calibration so the model
// matches the team's real pace. Two signals: the hours Dan triaged
// (his estimate) and, where the work is finished, the ACTUAL billed
// hours from /done. Actuals are weighted as the stronger signal. The
// model itself does not learn; these examples are fed fresh each call.
async function calibrationExamples(): Promise<string> {
  try {
    const supabase = createServiceRoleClient();
    const { data: reqs } = await supabase
      .from("consulting_requests")
      .select("id,title,type,estimate_hours")
      .not("estimate_hours", "is", null)
      .not("type", "is", null)
      .order("id", { ascending: false })
      .limit(10);
    const reqRows = (reqs ?? []) as Array<{
      id: number;
      title: string;
      type: string | null;
      estimate_hours: number | null;
    }>;
    if (!reqRows.length) return "";

    const { data: entries } = await supabase
      .from("consulting_time_entries")
      .select("request_id,billed_min")
      .in(
        "request_id",
        reqRows.map((r) => r.id),
      );
    const actualByReq = new Map<number, number>();
    for (const e of (entries ?? []) as Array<{
      request_id: number;
      billed_min: number | null;
    }>) {
      actualByReq.set(
        e.request_id,
        (actualByReq.get(e.request_id) ?? 0) + (e.billed_min ?? 0),
      );
    }

    const lines = reqRows.map((r) => {
      const label = r.type === "ad_hoc" ? "Ad Hoc" : "Maintenance";
      const actualMin = actualByReq.get(r.id);
      return actualMin
        ? `- "${r.title}" -> ${label}, estimated ${r.estimate_hours} hrs, ACTUAL ${(actualMin / 60).toFixed(1)} hrs`
        : `- "${r.title}" -> ${label}, estimated ${r.estimate_hours} hrs`;
    });

    return (
      "\n\nFor calibration, here are recent requests with the team's estimated " +
      "hours and, where the work is finished, the ACTUAL hours it took. Weight " +
      "ACTUAL hours most heavily (strongest signal); fall back to the estimate " +
      "when there is no actual yet. Match this pace and do not over-estimate:\n" +
      lines.join("\n")
    );
  } catch (err) {
    console.error("calibrationExamples failed:", err);
    return "";
  }
}

export interface Estimate {
  hours: number;
  type: "maintenance" | "ad_hoc";
  rationale: string;
  labels: string[];
}

const SYSTEM = [
  "You estimate developer hours for consulting requests on NurseDex, a",
  "Next.js + Supabase + Stripe nurse directory web app.",
  "Maintenance ($25/hr) = small fixes, copy/content tweaks, config, minor bugfixes.",
  "Ad hoc ($75/hr) = new features, new pages, schema changes, integrations.",
  "Estimate the total hours a competent developer needs end to end (build,",
  "test, deploy). Be realistic. If the request is vague, estimate",
  "conservatively and say so. Keep the rationale to one sentence.",
  `Also pick any relevant GitHub labels for this work from exactly this set (or an empty list): ${ISSUE_LABELS.join(", ")}.`,
].join(" ");

export async function estimateRequest(input: {
  title: string;
  description?: string | null;
  links?: string | null;
}): Promise<Estimate | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("Missing ANTHROPIC_API_KEY; skipping estimate");
    return null;
  }

  const userText = [
    `Title: ${input.title}`,
    input.description ? `Details: ${input.description}` : "",
    input.links ? `Links: ${input.links}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = SYSTEM + (await calibrationExamples());
  const body = {
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userText }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            hours: { type: "number" },
            type: { type: "string", enum: ["maintenance", "ad_hoc"] },
            rationale: { type: "string" },
            labels: {
              type: "array",
              items: { type: "string", enum: [...ISSUE_LABELS] },
            },
          },
          required: ["hours", "type", "rationale", "labels"],
          additionalProperties: false,
        },
      },
    },
  };

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Anthropic estimate failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Estimate;
    if (
      !Number.isFinite(parsed.hours) ||
      parsed.hours < 0 ||
      (parsed.type !== "maintenance" && parsed.type !== "ad_hoc")
    ) {
      return null;
    }
    // Keep only known repo labels, deduped.
    const allowed = new Set<string>(ISSUE_LABELS);
    parsed.labels = Array.from(
      new Set((parsed.labels ?? []).filter((l) => allowed.has(l))),
    );
    return parsed;
  } catch (err) {
    console.error("estimateRequest error:", err);
    return null;
  }
}
