import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { slackPost, ALERTS_CHANNEL_ID } from "@/lib/slack/client";
import {
  readScoredProfiles,
  rowsNeedingRepair,
  summarise,
} from "@/lib/data-drift/completeness";
import {
  readAllZips,
  readReference,
  zipsNeedingCorrection,
  summariseZips,
} from "@/lib/data-drift/zips";

export const runtime = "nodejs";
// Two paged reads over about 2,300 rows plus an in-memory comparison. Measured
// against production on 2026-09-04, both scripts finish in a few seconds from a
// laptop. Sixty seconds is far more than that and far less than the platform
// ceiling, so a read that hangs fails rather than holding the function open.
export const maxDuration = 60;

/**
 * Weekly. Reports the two kinds of stored data that have been seen to fall out
 * of step with reality, and alerts when either has (#927).
 *
 * Both were found only because somebody went looking. 67 of 134 profiles
 * carried a completeness score below what their profile earns, some by 90
 * points, which decides where a nurse appears in search. 21 zip codes sat more
 * than three miles from where that zip really is, the worst 41.6 miles, which
 * decides how far away every nurse in them looks.
 *
 * IT REPORTS AND NEVER REPAIRS. Both repairs exist as scripts a person runs
 * with --apply, and they stay that way: a correction moves where a nurse
 * appears in the directory, which is a decision rather than housekeeping.
 *
 * FINDING DRIFT IS A 200. A run that found something and a run that never
 * happened are different states and must not share one status field (L53).
 * withCronAlerting writes the heartbeat only on a 2xx, so answering non-2xx on
 * a finding would make the watchdog report this job as having stopped running
 * every week it found something, which is the louder and wronger alarm. A
 * failed READ is a real failure and does throw, because a watcher that reports
 * a clean result when it could not look is the defect this exists to remove
 * (L98).
 *
 * The absence of a run is watched for free: the Job Watchdog reads every
 * scheduled job in vercel.json and judges each against its own schedule, so
 * this one is covered by being listed there rather than by anybody remembering
 * to add it.
 */
const handleDataDrift = withCronAlerting(
  "data-drift",
  async (_request: NextRequest) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for the data drift check.",
      );
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    // Both readers refuse a short read rather than reporting on a prefix, and
    // both throw on a failed one, so an unreachable database fails the run
    // instead of reading as no drift.
    const profiles = await readScoredProfiles({ fetchFn: fetch, url, headers });
    const scoreDrift = rowsNeedingRepair(profiles);

    const storedZips = await readAllZips({ fetchFn: fetch, url, headers });
    const reference = readReference();
    // An empty reference is refused rather than compared against.
    // zipsNeedingCorrection is right to skip a zip the reference has never
    // heard of, which means an empty one skips every zip and reports a
    // perfectly clean result having compared nothing at all. The list is a
    // file in the repository, so this is also what a deployment that did not
    // carry it looks like.
    if (reference.size === 0) {
      throw new Error(
        "The zip reference list read as empty, so every zip would have been skipped and the result would have been clean without comparing anything.",
      );
    }
    const zipDrift = zipsNeedingCorrection(storedZips, reference);

    const findings: string[] = [];
    if (scoreDrift.length > 0) {
      findings.push(
        `*Profile completeness* (${scoreDrift.length} of ${profiles.length})\n` +
          `${summarise(scoreDrift)}\n` +
          "Repair with `npx tsx scripts/completeness-drift.ts --apply`.",
      );
    }
    if (zipDrift.length > 0) {
      findings.push(
        `*Zip coordinates* (${zipDrift.length} of ${storedZips.length})\n` +
          `${summariseZips(zipDrift)}\n` +
          `Affected: ${zipDrift.map((z) => z.zip).join(", ")}\n` +
          "Repair with `npx tsx scripts/zip-coordinates-drift.ts --apply`.",
      );
    }

    // One message carrying both, not one per check. They arrive together, are
    // read together, and two alerts a week for the same run is how an alert
    // stops being read (L36).
    let alerted: boolean | null = null;
    if (findings.length > 0) {
      alerted = true;
      try {
        await slackPost("chat.postMessage", {
          channel: ALERTS_CHANNEL_ID,
          text:
            "Stored data has drifted from what it describes.\n\n" +
            findings.join("\n\n") +
            "\n\nNothing has been changed: these repairs move where a nurse " +
            "appears in the directory, so a person decides.",
        });
      } catch (err) {
        // A send that fails must not turn a run that did its work into a
        // failure, and must not vanish either. The counts below still reach
        // last_result, which the admin jobs page renders, so the finding
        // survives an alert that never arrived (#885).
        alerted = false;
        console.error("[cron data-drift] could not post the finding:", err);
      }
    }

    return NextResponse.json({
      success: true,
      alerted,
      completeness: { examined: profiles.length, drifted: scoreDrift.length },
      zips: { examined: storedZips.length, drifted: zipDrift.length },
    });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleDataDrift(request);
}
