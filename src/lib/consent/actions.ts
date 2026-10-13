"use server";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isConsentEventKind, type ConsentEventKind } from "./kinds";

const SELF_DECLARED_BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

/**
 * Adds one to today's count for a banner event. Callable by anyone, signed in
 * or not, so it accepts only the three kinds, skips self declared crawlers,
 * and logs its failures rather than sending them to Sentry: a caller who can
 * trigger an error at will must not fill the alert channel (L498). Silence is
 * caught instead by the weekly data drift check (Task 5). The worst abuse is a
 * skewed admin only ratio.
 *
 * Never throws: the banner has already applied the answer locally.
 */
export async function recordConsentEvent(kind: ConsentEventKind): Promise<{ ok: boolean }> {
  if (!isConsentEventKind(kind)) return { ok: false };
  try {
    const ua = (await headers()).get("user-agent") ?? "";
    if (SELF_DECLARED_BOT.test(ua)) return { ok: false };
    const { error } = await createServiceRoleClient().rpc("increment_consent_tally", {
      p_kind: kind,
    });
    if (error) {
      console.error("[consent-tally] could not count", kind, error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[consent-tally] could not count", kind, err);
    return { ok: false };
  }
}
