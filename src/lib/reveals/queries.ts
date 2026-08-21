import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import {
  NURSE_CARD_COLUMNS,
  attachNurseCardPhotos,
  shapeNurseCards,
  toPublicNurseCard,
  type NurseSearchCard,
} from "@/lib/nurses/card";

export interface RevealedNurse extends NurseSearchCard {
  // The reveal's expiration date when set (i.e., the family has cancelled
  // their sub but is still in the 60-day window). Null means active access.
  access_expires_at: string | null;
  revealed_at: string;
}

/**
 * True while the family still has access to this reveal. A null expiry means
 * an active subscription; a set one means access ends at that moment.
 *
 * One predicate, used by both readers of the same fact. getRevealedNurses used
 * to have no expiry test at all, so it rendered a nurse's full last name after
 * the RPC behind the profile page had already started refusing the same
 * family (#770).
 */
export function isRevealActive(
  accessExpiresAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!accessExpiresAt) return true;
  return new Date(accessExpiresAt).getTime() > now;
}

/**
 * The set of nurse user_ids the family currently has access to (active
 * reveals, or cancelled reveals still inside the 60-day window). Lightweight
 * companion to getRevealedNurses for marking and sorting search results.
 */
export async function getRevealedNurseIds(
  familyUserId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reveals")
    .select("nurse_user_id, access_expires_at")
    .eq("family_user_id", familyUserId);
  const now = Date.now();
  return new Set(
    (data ?? [])
      .filter((r) => isRevealActive(r.access_expires_at, now))
      .map((r) => r.nurse_user_id as string),
  );
}

/**
 * Fetch the family's revealed nurses, newest first.
 * Drops nurses that are deleted/suspended/unverified out of an abundance
 * of safety, even though the row exists.
 */
export async function getRevealedNurses(
  familyUserId: string,
  limit?: number,
): Promise<RevealedNurse[]> {
  // reveals.nurse_user_id has its foreign key to users, not nurse_profiles,
  // so PostgREST can't embed nurse_profiles directly off reveals (it errors
  // with PGRST200). Fetch the reveal rows first, then load the nurse cards
  // from nurse_profiles with the users!inner embed, the same shape search.ts
  // uses. Service role is required because RLS on users hides other people's
  // rows from the family; the query is still scoped to this family's own
  // reveals and cards never render contact fields.
  const supabase = createServiceRoleClient();

  let revealQuery = supabase
    .from("reveals")
    .select("nurse_user_id, revealed_at, access_expires_at")
    .eq("family_user_id", familyUserId)
    .order("revealed_at", { ascending: false });

  if (limit) revealQuery = revealQuery.limit(limit);

  const { data: revealRows, error: revealError } = await revealQuery;
  if (revealError) {
    console.error(
      "getRevealedNurses reveal query failed:",
      revealError.message,
    );
    return [];
  }
  if (!revealRows || revealRows.length === 0) return [];

  // #770: a reveal past its access_expires_at is no longer the family's to
  // see. getRevealedNurseIds and migration 057's RPC already refuse it; this
  // reader used to disagree with both and render the nurse's full name.
  const now = Date.now();
  const activeReveals = revealRows.filter((r) =>
    isRevealActive(r.access_expires_at, now),
  );
  if (activeReveals.length === 0) return [];

  const nurseIds = activeReveals.map((r) => r.nurse_user_id);

  const cardsQuery = supabase
    .from("nurse_profiles")
    .select(NURSE_CARD_COLUMNS)
    .in("user_id", nurseIds);
  const { data, error } = await applyVisibleNurseFilter(cardsQuery);

  if (error || !data) {
    if (error) {
      console.error("getRevealedNurses card query failed:", error.message);
    }
    return [];
  }

  // Every reveal left in activeReveals is one this family still has access to,
  // so identity is theirs to see. #770 / #771: gated in the shared shaper, in
  // the data, rather than by a prop on the page.
  const shaped = shapeNurseCards(data, { canSeeIdentity: true });
  const byId = new Map(shaped.map((c) => [c.user_id, c]));

  // Iterate reveals (already newest first) so order and access window come
  // from the reveal row, while the card fields come from nurse_profiles.
  const cards = [];
  const meta = new Map<
    string,
    { access_expires_at: string | null; revealed_at: string }
  >();
  for (const r of activeReveals) {
    const card = byId.get(r.nurse_user_id);
    if (!card) continue;
    cards.push(card);
    meta.set(card.user_id, {
      access_expires_at: r.access_expires_at,
      revealed_at: r.revealed_at,
    });
  }

  await attachNurseCardPhotos(cards);

  return cards.map((card) => ({
    ...toPublicNurseCard(card),
    ...meta.get(card.user_id)!,
  }));
}
