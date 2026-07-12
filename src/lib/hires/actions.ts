"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { guardedStatusUpdate } from "@/lib/db/guarded-status-update";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import {
  familyRecordHireSchema,
  claimHireByEmailSchema,
  confirmHireSchema,
} from "@/lib/schemas/hire";
import {
  sendHireConfirmRequestEmail,
  sendHireConfirmedEmail,
} from "@/lib/email/send";

export type HireActionError =
  | "invalid"
  | "wrong_role"
  | "not_revealed"
  | "already_recorded"
  | "email_not_found"
  | "no_reveal_record"
  | "not_found"
  | "wrong_state"
  | "too_soon"
  | "unknown";

// How long a nurse must wait before re-sending a hire-confirmation email to
// the same family, so the resend path can't be used to spam someone.
const HIRE_CONFIRM_COOLDOWN_MS = 60 * 60 * 1000;

export interface HireActionResult {
  success: boolean;
  error?: HireActionError;
  fieldErrors?: Record<string, string>;
  hireId?: string;
  // True when an existing pending claim's confirmation email was re-sent
  // rather than a new claim being created.
  resent?: boolean;
}

/**
 * Family records a hire they made. Goes straight to confirmed since
 * the family is the source of truth here. Sends the nurse a "you got
 * hired" notification.
 */
export async function recordFamilyHire(
  raw: unknown,
): Promise<HireActionResult> {
  const parsed = familyRecordHireSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const user = await requireRole(UserRole.FAMILY);
  const supabase = await createClient();

  const { data: reveal } = await supabase
    .from("reveals")
    .select("id")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", parsed.data.nurse_user_id)
    .maybeSingle();
  if (!reveal) return { success: false, error: "not_revealed" };

  const { data: existing } = await supabase
    .from("hires")
    .select("id, status")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", parsed.data.nurse_user_id)
    .maybeSingle();
  if (existing && existing.status !== "rejected") {
    return { success: false, error: "already_recorded" };
  }

  const confirmed = {
    status: "confirmed",
    claimed_by: "family",
    confirmed_at: new Date().toISOString(),
  };

  let hireId: string;

  if (existing) {
    // A previously rejected hire. It used to be re-recorded by inserting a
    // SECOND row for the same pair, which migration 058 now forbids, so revive
    // the row instead. Guarded on the rejected status, because two callers both
    // reading "rejected" and both writing is how the nurse got mailed twice.
    const revived = await guardedStatusUpdate(supabase, {
      table: "hires",
      id: existing.id,
      expectedStatus: "rejected",
      patch: confirmed,
    });
    if (revived.outcome === "error") {
      console.error("[hires] family re-record failed:", revived.message);
      return { success: false, error: "unknown" };
    }
    // A concurrent caller revived it first. Their email is already on its way.
    if (revived.outcome === "already_resolved") {
      return { success: false, error: "already_recorded" };
    }
    hireId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("hires")
      .insert({
        family_user_id: user.id,
        nurse_user_id: parsed.data.nurse_user_id,
        ...confirmed,
      })
      .select("id")
      .single();

    // 23505 is the UNIQUE (family_user_id, nurse_user_id) constraint from
    // migration 058: a concurrent caller inserted the same hire between our
    // check above and this write. Exactly one of us won, and the winner is
    // mailing the nurse. Silently ok, not an error to shout about.
    if (error && (error as { code?: string }).code === "23505") {
      return { success: false, error: "already_recorded" };
    }
    if (error || !inserted) {
      console.error("[hires] family record failed:", error?.message);
      return { success: false, error: "unknown" };
    }
    hireId = inserted.id;
  }

  // Notify the nurse using the service-role client to look up their
  // email; the family doesn't have RLS read on the nurse's user row.
  const service = createServiceRoleClient();
  const { data: nurseUser } = await service
    .from("users")
    .select("email, first_name")
    .eq("id", parsed.data.nurse_user_id)
    .maybeSingle();
  if (nurseUser?.email) {
    after(() =>
      sendHireConfirmedEmail({
        to: nurseUser.email,
        firstName: nurseUser.first_name ?? undefined,
        familyFirstName: user.first_name ?? "A NurseDex family",
      }).catch((err) => console.error("[email] hire confirmed failed:", err)),
    );
  }

  revalidatePath("/dashboard/revealed");
  revalidatePath("/dashboard");
  return { success: true, hireId };
}

/**
 * Nurse claims they hired a family. Three outcomes:
 *  - email_not_found: no NurseDex account with that email
 *  - no_reveal_record: account exists but never revealed this nurse
 *  - success: pending row inserted with claim_token; family gets email
 *
 * Per the product call we differentiate the two error cases so the
 * nurse gets actionable feedback. The privacy concern (enumerating
 * emails) is muted for verified nurses.
 */
export async function claimHireByEmail(
  raw: unknown,
): Promise<HireActionResult> {
  const parsed = claimHireByEmailSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }

  const nurse = await requireRole(UserRole.NURSE);
  const service = createServiceRoleClient();

  const { data: family } = await service
    .from("users")
    .select("id, email, first_name, role, is_deleted, is_suspended")
    .eq("email", parsed.data.family_email)
    .maybeSingle();

  if (!family || family.is_deleted || family.role !== "family") {
    return { success: false, error: "email_not_found" };
  }
  if (family.is_suspended) {
    return { success: false, error: "no_reveal_record" };
  }

  const { data: reveal } = await service
    .from("reveals")
    .select("id")
    .eq("family_user_id", family.id)
    .eq("nurse_user_id", nurse.id)
    .maybeSingle();
  if (!reveal) {
    return { success: false, error: "no_reveal_record" };
  }

  const { data: existing } = await service
    .from("hires")
    .select("id, status, claimed_by, claim_token")
    .eq("family_user_id", family.id)
    .eq("nurse_user_id", nurse.id)
    .maybeSingle();
  if (existing && existing.status !== "rejected") {
    // A pending claim the nurse already sent: re-send the confirmation
    // email (reusing the token) instead of blocking. A confirmed hire, or
    // one the family recorded, is genuinely already on file.
    if (existing.status === "claimed" && existing.claimed_by === "nurse") {
      // Rate limit: don't let the resend path spam the same family. Block if
      // a hire-confirmation email went to them within the cooldown window.
      const since = new Date(
        Date.now() - HIRE_CONFIRM_COOLDOWN_MS,
      ).toISOString();
      const { count: recent } = await service
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", family.id)
        .eq("email_type", "hire_confirm_request")
        .gte("sent_at", since);
      if ((recent ?? 0) > 0) {
        return { success: false, error: "too_soon" };
      }

      const token = existing.claim_token ?? crypto.randomUUID();
      if (!existing.claim_token) {
        await service
          .from("hires")
          .update({ claim_token: token })
          .eq("id", existing.id);
      }
      await service.from("email_log").insert({
        recipient_user_id: family.id,
        email_type: "hire_confirm_request",
        dedup_key: existing.id,
      });
      after(() =>
        sendHireConfirmRequestEmail({
          to: family.email,
          firstName: family.first_name ?? undefined,
          nurseFirstName: nurse.first_name ?? "Your NurseDex nurse",
          claimToken: token,
        }).catch((err) =>
          console.error("[email] hire confirm request resend failed:", err),
        ),
      );
      return { success: true, hireId: existing.id, resent: true };
    }
    return { success: false, error: "already_recorded" };
  }

  const claimToken = crypto.randomUUID();
  const claim = {
    status: "claimed",
    claimed_by: "nurse",
    claim_token: claimToken,
  };

  let hireId: string;

  if (existing) {
    // Only a rejected hire reaches here (anything else returned above). It used
    // to be re-claimed by inserting a second row for the same pair, which
    // migration 058 forbids, so revive the existing one with a fresh token.
    // Guarded on the rejected status so two claims cannot both revive it and
    // both mail the family (#651).
    const revived = await guardedStatusUpdate(service, {
      table: "hires",
      id: existing.id,
      expectedStatus: "rejected",
      patch: { ...claim, confirmed_at: null },
    });
    if (revived.outcome === "error") {
      console.error("[hires] nurse re-claim failed:", revived.message);
      return { success: false, error: "unknown" };
    }
    if (revived.outcome === "already_resolved") {
      return { success: false, error: "already_recorded" };
    }
    hireId = existing.id;
  } else {
    const { data: inserted, error } = await service
      .from("hires")
      .insert({
        family_user_id: family.id,
        nurse_user_id: nurse.id,
        ...claim,
      })
      .select("id")
      .single();

    // The UNIQUE (family_user_id, nurse_user_id) constraint: a concurrent caller
    // got there between the check above and this write.
    if (error && (error as { code?: string }).code === "23505") {
      return { success: false, error: "already_recorded" };
    }
    if (error || !inserted) {
      console.error("[hires] nurse claim failed:", error?.message);
      return { success: false, error: "unknown" };
    }
    hireId = inserted.id;
  }

  // Log the send so a subsequent resend respects the cooldown window.
  await service.from("email_log").insert({
    recipient_user_id: family.id,
    email_type: "hire_confirm_request",
    dedup_key: hireId,
  });
  after(() =>
    sendHireConfirmRequestEmail({
      to: family.email,
      firstName: family.first_name ?? undefined,
      nurseFirstName: nurse.first_name ?? "Your NurseDex nurse",
      claimToken,
    }).catch((err) =>
      console.error("[email] hire confirm request failed:", err),
    ),
  );

  revalidatePath("/dashboard");
  return { success: true, hireId };
}

/**
 * Family confirms a nurse-claimed hire from the email link.
 */
export async function confirmHireFromToken(
  raw: unknown,
): Promise<HireActionResult> {
  const parsed = confirmHireSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const user = await requireRole(UserRole.FAMILY);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("hires")
    .select("id, status, family_user_id, nurse_user_id")
    .eq("claim_token", parsed.data.token)
    .maybeSingle();
  if (!row || row.family_user_id !== user.id) {
    return { success: false, error: "not_found" };
  }
  if (row.status !== "claimed") {
    return { success: false, error: "wrong_state" };
  }

  // Keep claim_token so re-opening the link shows "Already handled" rather
  // than "Link not valid". The status guard above is a stale read; the
  // guarded update is what actually enforces single-use against a concurrent
  // confirm/reject on the same row.
  const result = await guardedStatusUpdate(supabase, {
    table: "hires",
    id: row.id,
    expectedStatus: "claimed",
    patch: {
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    },
  });
  if (result.outcome === "error") {
    console.error("[hires] confirm failed:", result.message);
    return { success: false, error: "unknown" };
  }
  if (result.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  // Notify the nurse.
  const service = createServiceRoleClient();
  const { data: nurseUser } = await service
    .from("users")
    .select("email, first_name")
    .eq("id", row.nurse_user_id)
    .maybeSingle();
  if (nurseUser?.email) {
    after(() =>
      sendHireConfirmedEmail({
        to: nurseUser.email,
        firstName: nurseUser.first_name ?? undefined,
        familyFirstName: user.first_name ?? "A NurseDex family",
      }).catch((err) => console.error("[email] hire confirmed failed:", err)),
    );
  }

  // Note: no revalidatePath here. Revalidating from this server action would
  // refetch the confirm page and re-query the (now resolved) hire, fighting
  // the inline success state. The nurse's dashboard is dynamic and shows the
  // updated count on its next load.
  return { success: true, hireId: row.id };
}

/**
 * Family rejects a nurse-claimed hire from the email link. Status
 * flips to rejected.
 */
export async function rejectHireFromToken(
  raw: unknown,
): Promise<HireActionResult> {
  const parsed = confirmHireSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const user = await requireRole(UserRole.FAMILY);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("hires")
    .select("id, status, family_user_id")
    .eq("claim_token", parsed.data.token)
    .maybeSingle();
  if (!row || row.family_user_id !== user.id) {
    return { success: false, error: "not_found" };
  }
  if (row.status !== "claimed") {
    return { success: false, error: "wrong_state" };
  }

  // Keep claim_token (re-opening shows "Already handled", not "Link not
  // valid"), and skip revalidatePath so it doesn't fight the inline result.
  // The guarded update enforces single-use against a concurrent
  // confirm/reject on the same row; the earlier status check is a stale read.
  const result = await guardedStatusUpdate(supabase, {
    table: "hires",
    id: row.id,
    expectedStatus: "claimed",
    patch: { status: "rejected" },
  });
  if (result.outcome === "error") {
    console.error("[hires] reject failed:", result.message);
    return { success: false, error: "unknown" };
  }
  if (result.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  return { success: true, hireId: row.id };
}
