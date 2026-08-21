import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "./visibility";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  NURSE_CARD_COLUMNS,
  attachNurseCardPhotos,
  shapeNurseCards,
  toPublicNurseCard,
  type NurseSearchCard,
} from "./card";

/**
 * Return the set of nurse_user_ids the current user has saved, out of a
 * given candidate list. Returns an empty set for non-family or anon viewers.
 */
export async function getSavedNurseIds(
  candidateNurseUserIds: string[],
): Promise<Set<string>> {
  if (candidateNurseUserIds.length === 0) return new Set();
  const user = await getCurrentUser();
  if (!user || user.role !== "family") return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_nurses")
    .select("nurse_user_id")
    .eq("family_user_id", user.id)
    .in("nurse_user_id", candidateNurseUserIds);

  return new Set((data ?? []).map((r) => r.nurse_user_id));
}

/**
 * Fetch the full list of nurses a family has saved, newest first.
 * Includes unavailable nurses (but not hidden or deleted ones).
 */
export async function getSavedNurses(
  familyUserId: string,
  { canSeeIdentity }: { canSeeIdentity: boolean },
): Promise<NurseSearchCard[]> {
  // saved_nurses.nurse_user_id has its foreign key to users, not
  // nurse_profiles, so PostgREST can't embed nurse_profiles directly off
  // saved_nurses (it errors with PGRST200). Fetch the saved rows first, then
  // load the cards from nurse_profiles with the users!inner embed, the same
  // shape search.ts uses. Service role is required because RLS on users hides
  // other people's rows from the family; cards never render contact fields.
  const supabase = createServiceRoleClient();

  const { data: savedRows, error: savedError } = await supabase
    .from("saved_nurses")
    .select("nurse_user_id, saved_at")
    .eq("family_user_id", familyUserId)
    .order("saved_at", { ascending: false });

  if (savedError || !savedRows || savedRows.length === 0) return [];

  const nurseIds = savedRows.map((r) => r.nurse_user_id);

  const cardsQuery = supabase
    .from("nurse_profiles")
    .select(NURSE_CARD_COLUMNS)
    .in("user_id", nurseIds);
  const { data, error } = await applyVisibleNurseFilter(cardsQuery);

  if (error || !data) {
    if (error) {
      console.error("getSavedNurses card query failed:", error.message);
    }
    return [];
  }

  // #770 / #771: one shared shaper, with the identity gate inside it, so this
  // producer cannot ship a last name the viewer is not entitled to.
  const shaped = shapeNurseCards(data, { canSeeIdentity });
  const byId = new Map(shaped.map((c) => [c.user_id, c]));

  // Iterate saved rows (already newest first) so card order follows saved_at.
  const cards = [];
  for (const row of savedRows) {
    const card = byId.get(row.nurse_user_id);
    if (!card) continue;
    // Drop hidden-when-unavailable nurses (verified + not deleted/suspended
    // are already enforced in the query).
    if (!card.is_available && card.unavailable_visibility === "hidden")
      continue;
    cards.push(card);
  }

  await attachNurseCardPhotos(cards);

  return cards.map(toPublicNurseCard);
}
