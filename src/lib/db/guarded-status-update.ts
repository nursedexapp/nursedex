import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Result of a guarded status transition.
 *
 * `already_resolved` means the row existed but was no longer in the expected
 * status, so a concurrent caller won the race. Callers must treat it as "do
 * not fire the side effect again", not as a failure.
 */
export type GuardedStatusUpdateResult =
  | { outcome: "updated" }
  | { outcome: "already_resolved" }
  | { outcome: "error"; message: string };

/**
 * The state the row must still be in for this transition to be legal.
 *
 * An array means "any of these": approving a nurse's verification is legal from
 * `pending` and also from `rejected` (an admin reversing a rejection), and a
 * single expected status could not express that. A boolean guards a flag column
 * such as `users.is_suspended`. Both exist because the admin actions could not
 * otherwise adopt this helper and kept hand-rolling the race instead (#652).
 */
export type ExpectedStatus = string | boolean | readonly string[];

export interface GuardedStatusUpdateArgs {
  table: string;
  id: string | number;
  expectedStatus: ExpectedStatus;
  patch: Record<string, unknown>;
  idColumn?: string;
  statusColumn?: string;
}

/**
 * Perform a status transition that cannot be double-applied.
 *
 * Reading a row's status and then updating it by id alone is a check-then-act
 * race: two concurrent callers both pass the JS check, both write, and both
 * go on to fire whatever side effect the transition guards (a GitHub issue, a
 * Slack reply, an email). Putting the expected status into the UPDATE's own
 * WHERE clause makes the database the arbiter: exactly one caller matches a
 * row, and the loser gets zero rows back.
 *
 * Extracted after this same bug appeared twice, in hires confirm/reject
 * (#419) and the Slack consulting-request approval flow (#562). Reach for
 * this rather than re-deriving the pattern.
 */
export async function guardedStatusUpdate(
  client: SupabaseClient,
  {
    table,
    id,
    expectedStatus,
    patch,
    idColumn = "id",
    statusColumn = "status",
  }: GuardedStatusUpdateArgs,
): Promise<GuardedStatusUpdateResult> {
  const guarded = client.from(table).update(patch).eq(idColumn, id);

  const { data, error } = await (
    Array.isArray(expectedStatus)
      ? guarded.in(statusColumn, expectedStatus as string[])
      : guarded.eq(statusColumn, expectedStatus as string | boolean)
  ).select(idColumn);

  // An error wins over any rows handed back, so a caller can never fire a
  // side effect on a write that did not land.
  if (error) return { outcome: "error", message: error.message };
  if (!data || data.length === 0) return { outcome: "already_resolved" };
  return { outcome: "updated" };
}
