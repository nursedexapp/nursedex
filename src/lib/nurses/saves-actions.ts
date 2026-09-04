"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";

import { toTypedFailure } from "@/lib/db/results";
export interface ToggleSaveResult {
  success: boolean;
  isSaved: boolean;
  error?: string;
}

/**
 * Toggle a family's saved-nurse relationship.
 * Requires family role. RLS enforces ownership.
 */
export async function toggleSavedNurse(
  nurseUserId: string,
): Promise<ToggleSaveResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, isSaved: false, error: "not_authenticated" };
  }
  if (user.role !== "family") {
    return { success: false, isSaved: false, error: "wrong_role" };
  }

  const supabase = await createClient();

  // A failed read is NOT "this nurse is not saved" (#847). This control is a
  // TOGGLE, so answering that way makes it do the opposite of what the family
  // asked: pressing unsave on a saved nurse would save them again. The heart
  // stays where it was and the caller is told to try again.
  const existingRead = await toTypedFailure(
    supabase
      .from("saved_nurses")
      .select("id")
      .eq("family_user_id", user.id)
      .eq("nurse_user_id", nurseUserId)
      .maybeSingle(),
    "whether this family has saved this nurse",
  );
  // isSaved is not read on a refusal: SaveHeartButton rolls the heart back to
  // what it was before the optimistic flip, for every unsuccessful result.
  if (!existingRead.ok) {
    return { success: false, isSaved: false, error: "could_not_check" };
  }
  const existing = existingRead.data;

  if (existing) {
    const { error } = await supabase
      .from("saved_nurses")
      .delete()
      .eq("id", existing.id);
    if (error) {
      return { success: false, isSaved: true, error: error.message };
    }
    revalidatePath("/dashboard/saved");
    return { success: true, isSaved: false };
  }

  const { error } = await supabase.from("saved_nurses").insert({
    family_user_id: user.id,
    nurse_user_id: nurseUserId,
  });
  if (error) {
    return { success: false, isSaved: false, error: error.message };
  }

  // Best-effort analytics increment, don't fail the save if it errors.
  // eslint-disable-next-line local/require-db-error-check -- deliberately discarded. The value is a view and save counter on the nurse's own stats page, and NOTHING reads this result. The save itself is already written, so refusing here would fail a save the family asked for in order to protect a counter.
  await supabase
    .rpc("increment_nurse_analytics", {
      p_nurse_user_id: nurseUserId,
      p_field: "saves",
    })
    .then(
      () => undefined,
      () => undefined,
    );

  // Best-effort upsell counter for the saved nurse. RLS would block a
  // family from writing to the nurse's row directly, so this goes through
  // a SECURITY DEFINER RPC.
  // eslint-disable-next-line local/require-db-error-check -- deliberately discarded. The value is an upsell counter on the nurse's row, and NOTHING reads this result. The save itself is already written, so refusing here would fail a save the family asked for in order to protect a counter.
  await supabase
    .rpc("increment_save_count_for_upsell", { p_nurse_user_id: nurseUserId })
    .then(
      () => undefined,
      () => undefined,
    );

  revalidatePath("/dashboard/saved");
  return { success: true, isSaved: true };
}
