/**
 * Postgres error codes we treat as answers rather than failures.
 *
 * The pattern these serve (#663, #708, #696): make the write itself the gate.
 * Rather than reading to see whether a row exists and then deciding whether to
 * write, just write, and let a uniqueness constraint arbitrate. The loser gets a
 * code back, and that code IS the answer: "someone already did this".
 *
 * Checking the code by hand in each caller was fine once and drift by the third
 * time, so it lives here.
 */

/** unique_violation. A row with this key already exists, so this write is a repeat. */
export const UNIQUE_VIOLATION = "23505";

/** True when a Supabase/PostgREST error is a duplicate-key rejection. */
export function isUniqueViolation(
  error: { code?: string | null } | null | undefined,
): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

/**
 * True when the duplicate was rejected by one NAMED constraint. A table can
 * carry several unique keys, and only one of them may mean "already done":
 * a nurse profile repeated on user_id is a repeat, one colliding on slug is not.
 */
export function isUniqueViolationOn(
  error: { code?: string | null; message?: string | null } | null | undefined,
  constraint: string,
): boolean {
  return (
    isUniqueViolation(error) &&
    (error?.message ?? "").includes(`"${constraint}"`)
  );
}
