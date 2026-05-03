"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";

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

  const { data: existing } = await supabase
    .from("saved_nurses")
    .select("id")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", nurseUserId)
    .maybeSingle();

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
  await supabase
    .rpc("increment_save_count_for_upsell", { p_nurse_user_id: nurseUserId })
    .then(
      () => undefined,
      () => undefined,
    );

  revalidatePath("/dashboard/saved");
  return { success: true, isSaved: true };
}
