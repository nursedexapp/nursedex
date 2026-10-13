import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isConsentEventKind } from "@/lib/consent/kinds";
import { newYorkDay } from "@/lib/dates/new-york-day";

export type ConsentTally =
  | { status: "ok"; days: number; shown: number; accepted: number; declined: number; acceptRate: number | null }
  | { status: "error"; message: string };

export const CONSENT_RATE_MIN_SHOWN = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export function summariseConsentRows(rows: unknown, days: number): ConsentTally {
  const totals = { shown: 0, accepted: 0, declined: 0 };
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const { kind, count } = row as { kind?: unknown; count?: unknown };
      if (!isConsentEventKind(kind)) continue;
      if (typeof count !== "number" || !Number.isFinite(count)) continue;
      totals[kind] += count;
    }
  }
  // A browser's answer is counted only after its showing was (Task 6), so
  // answers outnumbering showings means the counting broke. Refuse it rather
  // than print a rate over 100% (L588).
  if (totals.accepted + totals.declined > totals.shown) {
    return {
      status: "error",
      message: `Answers (${totals.accepted + totals.declined}) outnumber showings (${totals.shown}), so the count is not trustworthy.`,
    };
  }
  const acceptRate = totals.shown >= CONSENT_RATE_MIN_SHOWN ? totals.accepted / totals.shown : null;
  return { status: "ok", days, ...totals, acceptRate };
}

/** Exactly `days` New York days ending today. Never throws: the section renders the error. */
export async function getConsentTally(days = 30, now: Date = new Date()): Promise<ConsentTally> {
  const since = newYorkDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  try {
    const { data, error } = await createServiceRoleClient()
      .from("consent_tally")
      .select("day, kind, count")
      .gte("day", since);
    if (error) {
      console.error("[consent-tally] could not read", error);
      return { status: "error", message: `The banner counts could not be read: ${error.message}` };
    }
    return summariseConsentRows(data ?? [], days);
  } catch (err) {
    console.error("[consent-tally] could not read", err);
    return { status: "error", message: "The banner counts could not be read." };
  }
}

export function consentNoteText(t: Extract<ConsentTally, { status: "ok" }>): string {
  if (t.shown === 0) {
    return `No browsers have been shown the banner in the last ${t.days} days. If the site had visitors in that time, the count is not being recorded.`;
  }
  if (t.acceptRate === null) {
    return `Too few browsers to read a rate yet (${t.shown} shown, ${CONSENT_RATE_MIN_SHOWN} needed).`;
  }
  return `${Math.round(t.acceptRate * 100)}% of browsers shown the banner in the last ${t.days} days accepted on their first answer. PostHog figures since launch come only from browsers that accepted.`;
}
