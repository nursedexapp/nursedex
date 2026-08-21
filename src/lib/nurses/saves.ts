import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "./visibility";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  NURSE_CARD_COLUMNS,
  attachNurseCardPhotos,
  attachNurseCardTowns,
  shapeNurseCards,
  toPublicNurseCard,
  type NurseSearchCard,
} from "./card";

/**
 * The most saved nurses one family can have and still be read in one request.
 * Comfortably above any real list; it exists so that passing it is a loud
 * failure rather than a quietly shortened set.
 */
export const SAVED_LIST_CAP = 900;

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
 * Every nurse_user_id this family has saved.
 *
 * getSavedNurseIds takes a candidate list and is called with only the current
 * page's ids, so it cannot produce a total. The "Saved only" chip needs the
 * whole set: to count it, and to constrain the query (#776).
 *
 * Read through the user's own client, not the service role one, so the
 * saved_nurses_select_own policy (family_user_id = auth.uid()) enforces the
 * scoping at the database rather than only in this function. The explicit
 * eq() stays as well: two independent statements of the same constraint, and
 * the one that cannot be forgotten is the policy.
 *
 * The family comes from the caller's session, never from the URL. The URL flag
 * only says whether to apply the constraint, never whose saves to apply.
 *
 * Returns null when the list could not be read completely. That is a third
 * answer, distinct from an empty set: an empty set would silently widen a
 * "Saved only" search to every nurse in the state, and throwing would take the
 * whole directory down for a signed in family over a filter they may not even
 * be using, since this runs on every load to count the chip. null lets the
 * page keep showing results and say the filter was not applied.
 */
export async function getAllSavedNurseIds(
  familyUserId: string,
): Promise<Set<string> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_nurses")
    .select("nurse_user_id")
    .eq("family_user_id", familyUserId)
    // PostgREST caps a request at 1,000 rows by default and says nothing when
    // it truncates. A silently short set would drop saved nurses out of a
    // Saved only search, so ask for one more than the cap and refuse a
    // response that reaches it rather than answering with a partial list.
    .limit(SAVED_LIST_CAP + 1);

  // Two distinct causes, two messages, one answer: the page's remedy is the
  // same either way, but nobody diagnosing this should have to guess which
  // happened.
  if (error) {
    console.error("Could not read a family's saved nurses:", error.message);
    return null;
  }

  const rows = data ?? [];
  if (rows.length > SAVED_LIST_CAP) {
    console.error(
      `A family has more than ${SAVED_LIST_CAP} saved nurses, which this read cannot return completely.`,
    );
    return null;
  }

  return new Set(rows.map((r) => r.nurse_user_id as string));
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
  // The saved list is behind requireRole(FAMILY), so the viewer is signed in
  // by construction and sees bio, rate and availability (#773).
  const shaped = shapeNurseCards(data, { canSeeIdentity, canSeeDetails: true });
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

  await Promise.all([
    attachNurseCardPhotos(cards),
    attachNurseCardTowns(cards),
  ]);

  return cards.map(toPublicNurseCard);
}
