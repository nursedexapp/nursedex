/**
 * CI entry point for the legacy Supabase host check (#744).
 *
 * Reads the JSON from `supabase db query --linked` on stdin, fetches each
 * published cover image still stored on the legacy host plus the legacy auth
 * endpoint, and exits non-zero when any of them has stopped serving.
 *
 * Usage:
 *   supabase db query --linked --output-format json "$(cat scripts/legacy-host.sql)" \
 *     | npx tsx scripts/check-legacy-host.ts
 */
import {
  collectLegacyImageUrls,
  evaluateLegacyHost,
  formatLegacyHostReport,
  legacyHealthUrl,
  type HostCheck,
} from "./legacy-host";
import { announce } from "./prod-smoke-notify";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Throws on an unreadable payload, so a query that never ran fails the job. */
function parseRows(raw: string): { cover_image_url?: string | null }[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "Legacy host check received an empty payload on stdin. The query did not " +
        "run, so nothing was verified. Failing rather than reporting a healthy host.",
    );
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array of rows, got ${typeof parsed}.`);
  }
  return parsed as { cover_image_url?: string | null }[];
}

async function probe(url: string): Promise<HostCheck> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { url, status: res.status };
  } catch (err: unknown) {
    // A request that never completed is a failure, never an absent result.
    return {
      url,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const rows = parseRows(await readStdin());

  // Throws when there is nothing on the legacy host to look at, which must fail
  // the job rather than read as an all clear.
  const urls = [...collectLegacyImageUrls(rows), legacyHealthUrl()];

  const result = evaluateLegacyHost(await Promise.all(urls.map(probe)));
  const report = formatLegacyHostReport(result);
  console.log(report);

  if (!result.ok) {
    await announce({ report, token: process.env.SLACK_BOT_TOKEN });
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    "Legacy Supabase host check failed to run:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
