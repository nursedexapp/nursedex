import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Hire } from "@/types/database";

/**
 * The current family user's existing hire row for a nurse, if any.
 * Used to flip the "I hired this nurse" button to a "Hired" badge once
 * recorded.
 */
export async function getFamilyHireForNurse(
  familyUserId: string,
  nurseUserId: string,
): Promise<Hire | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hires")
    .select("*")
    .eq("family_user_id", familyUserId)
    .eq("nurse_user_id", nurseUserId)
    .maybeSingle();
  return (data as Hire | null) ?? null;
}

export async function getFamilyHiresByNurse(
  familyUserId: string,
  nurseUserIds: string[],
): Promise<Map<string, Hire>> {
  if (nurseUserIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("hires")
    .select("*")
    .eq("family_user_id", familyUserId)
    .in("nurse_user_id", nurseUserIds);

  const map = new Map<string, Hire>();
  for (const row of (data ?? []) as Hire[]) {
    map.set(row.nurse_user_id, row);
  }
  return map;
}
