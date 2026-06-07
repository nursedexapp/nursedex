import "server-only";

// Ask Claude for a rough billing type + hour estimate from a request
// description, used to pre-fill the triage modal. Raw fetch (matching the
// Slack and GitHub helpers) so no SDK dependency. Returns null on any
// failure so intake never breaks if the estimate is unavailable.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

export interface Estimate {
  hours: number;
  type: "maintenance" | "ad_hoc";
  rationale: string;
}

const SYSTEM = [
  "You estimate developer hours for consulting requests on NurseDex, a",
  "Next.js + Supabase + Stripe nurse directory web app.",
  "Maintenance ($25/hr) = small fixes, copy/content tweaks, config, minor bugfixes.",
  "Ad hoc ($75/hr) = new features, new pages, schema changes, integrations.",
  "Estimate the total hours a competent developer needs end to end (build,",
  "test, deploy). Be realistic. If the request is vague, estimate",
  "conservatively and say so. Keep the rationale to one sentence.",
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

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
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
          },
          required: ["hours", "type", "rationale"],
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
    return parsed;
  } catch (err) {
    console.error("estimateRequest error:", err);
    return null;
  }
}
