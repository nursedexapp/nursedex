import * as Sentry from "@sentry/nextjs";

/**
 * The three ways a Supabase result may be consumed, in one place.
 *
 * A PostgREST call does not throw. It resolves to `{ data, error }`, so a
 * failure to read (a permission change, RLS, a dropped connection) arrives
 * looking exactly like an empty answer, and `const { data } = await ...`
 * treats it as the truth. Measured 4 September 2026, around 244 sites in this
 * repo did that (#847). The harm is never a blank screen: `hasRevealedNurse`
 * told a family who had spent a reveal that they had not, and
 * `getActiveSubscription` told a paying family they had no subscription
 * (#845). A reader that answers the same way for "no row" and "could not look"
 * cannot be told apart from a correct one (L215, L10).
 *
 * Which helper a call site wants is decided by ONE question: is somebody
 * waiting on a control?
 *
 *   - a `server-only` module behind a page render  -> unwrapOrThrow
 *     The throw reaches the route's error boundary, which is a screen that
 *     says something went wrong. That is the shape #780 shipped.
 *
 *   - a `"use server"` module behind a button      -> toTypedFailure
 *     A throwing server action does NOT render the error boundary. It rejects
 *     at the client and Next.js redacts the message to a digest, so the person
 *     sees a control that did nothing and presses it again (#846). The caller
 *     renders the returned sentence instead.
 *
 *   - a write whose result is otherwise unused     -> assertNoWriteError
 *
 * Where a refusal is recorded, settled here once (#986). NOT in the database:
 * the thing that just failed is the database, so a table is the one place the
 * record cannot be trusted to land. Sentry is the destination, and the split
 * is by who else is looking:
 *
 *   - the throwing helpers only throw. src/instrumentation.ts exports
 *     `onRequestError = Sentry.captureRequestError`, which Next.js calls for
 *     an uncaught server error, so capturing here as well would file every
 *     failure twice. A `console.error` goes out alongside the throw, because
 *     production shows the visitor a digest rather than the message.
 *   - `toTypedFailure` captures explicitly, because nothing throws, and
 *     "Sentry's global handler never sees caught errors" is already the
 *     recorded reason in src/lib/subscriptions/actions.ts.
 *
 * Slack is deliberately not used. This project's Slack alert path has a
 * history of appearing to work while delivering nothing (the bot was not a
 * channel member from the day it was wired until 2026-09-01), and an alert
 * path that reports success to nobody is worse than none.
 */

/**
 * PostgREST's "no rows returned". `.single()` reports zero matching rows as an
 * ERROR carrying this code, which is why the absent case has to be decided
 * here rather than at 41 call sites: a blanket throw would turn "this row does
 * not exist" into an error screen. There are 41 `.single()` calls against 91
 * `.maybeSingle()` in this repo and, before this module, exactly one place
 * showed any awareness of the difference (src/lib/profile/slug.ts).
 */
export const ROW_NOT_FOUND = "PGRST116";

/**
 * What a control shows when a read or write failed. One sentence, not one per
 * table: the person cannot act differently on "the subscriptions read failed"
 * than on "the reveals read failed", and the table name is ours, not theirs.
 * The operation is named to Sentry and to the server log instead. A call site
 * with something genuinely more useful to say passes its own sentence.
 */
export const DB_FAILURE_MESSAGE =
  "Something went wrong on our end. Please try again.";

/** The error half of a PostgREST result. */
export interface DbError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * A PostgREST result, as every Supabase query and write resolves to.
 *
 * The helpers below are generic over the WHOLE result rather than over the row
 * type, and read the row type back out with `R["data"]`. Supabase types a query
 * as a UNION of a success shape (`{ data: Row; error: null }`) and a failure
 * shape (`{ data: null; error: PostgrestError }`), and inferring a row type
 * from `data: T | null` against both branches at once resolves it to `never`,
 * after which the call site cannot read a single field off the row.
 *
 * What enforces this is `npm run typecheck` over the real call sites, and
 * nothing else. There is deliberately no unit test for it: a hand-built union
 * standing in for a Supabase response infers perfectly well, so such a test
 * passes whichever signature is in place, and a test that cannot fail is worse
 * than none. Reverting these two signatures to a row generic produces four
 * errors in src/lib/admin/account-actions.ts, which is the guard.
 */
export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

/** Anything shaped like a PostgREST result, including Supabase's own union. */
type DbResultLike = { data: unknown; error: DbError | null };

/** A `select("...", { count: "exact" })` result, whose answer is the count. */
type DbCountLike = { count: number | null; error: DbError | null };

/**
 * Every helper takes the query as well as the awaited result, so a query
 * sitting as an element of a `Promise.all` can be wrapped where it is written
 * rather than unpacked afterwards. Those 26 sites are invisible to any rule
 * written against a destructuring pattern (#991).
 */
type Awaitable<T> = T | PromiseLike<T>;

/** The outcome a `"use server"` module hands back to the control that called it. */
export type DbOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** True when the only thing wrong is that no row matched. */
function isRowNotFound(error: DbError | null): boolean {
  return error?.code === ROW_NOT_FOUND;
}

/**
 * Throw when a write failed.
 *
 * A zero-row result counts as a failure here, unlike on the read helpers: a
 * write that matched nothing is a write that did not happen, and reporting it
 * as success is the whole defect.
 *
 * Half of this shipped already, unexported, inside the Stripe webhook route,
 * where its docstring records why: an unchecked write failure returned 200,
 * Stripe never retried, and billing state diverged from the database in
 * silence.
 */
export async function assertNoWriteError(
  result: Awaitable<DbResult<unknown>>,
  context: string,
): Promise<void> {
  const { error } = await result;
  if (!error) return;
  const message = `${context} could not be written: ${error.message}`;
  console.error(message);
  throw new Error(message);
}

/**
 * Return the rows, or throw so the route's error boundary takes over.
 *
 * For `server-only` modules behind a page render. An absent row comes back as
 * null rather than throwing, and is not reported anywhere, because it is an
 * answer.
 */
export async function unwrapOrThrow<R extends DbResultLike>(
  result: Awaitable<R>,
  context: string,
): Promise<R["data"]> {
  const { data, error } = await result;
  if (!error) return data;
  if (isRowNotFound(error)) return null;
  const message = `${context} could not be read: ${error.message}`;
  console.error(message);
  throw new Error(message);
}

/**
 * Return either the data or a sentence the calling control can render.
 *
 * For `"use server"` modules. Nothing throws, so this is the one helper that
 * has to report the failure itself.
 */
export async function toTypedFailure<R extends DbResultLike>(
  result: Awaitable<R>,
  context: string,
  userMessage: string = DB_FAILURE_MESSAGE,
): Promise<DbOutcome<R["data"]>> {
  const { data, error } = await result;
  if (!error) return { ok: true, data };
  if (isRowNotFound(error)) return { ok: true, data: null };
  // "failed" rather than "could not be read": a `"use server"` module reaches
  // here for its writes too, and there is no second helper for those, because
  // a write in an action must return to the control rather than throw at it.
  const message = `${context} failed: ${error.message}`;
  console.error(message);
  Sentry.captureException(new Error(message), {
    tags: { db_operation: context },
  });
  return { ok: false, error: userMessage };
}

/**
 * The count from a `{ count: "exact" }` query, or a typed failure.
 *
 * A count needs its own pair of helpers because the answer is NOT in `data`:
 * a `head: true` count returns `{ data: null, count: N }`, so a call site that
 * reads the result through the data helpers gets `undefined` and `?? 0` turns
 * it into a confident zero. Sixteen such queries share one Promise.all in the
 * admin dashboard, each read as `count ?? 0`, so during a database problem the
 * dashboard reports zero nurses, zero hires and zero revenue, indistinguishable
 * from a genuinely empty product (#991).
 *
 * A null count without an error is refused rather than read as zero. PostgREST
 * returns a number whenever a count was asked for, so a null one means the
 * query did not carry the count option the caller thought it did, and zero is
 * the one answer that would look plausible.
 */
export async function toTypedCount(
  result: Awaitable<DbCountLike>,
  context: string,
  userMessage: string = DB_FAILURE_MESSAGE,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { count, error } = await result;
  if (!error && count !== null) return { ok: true, count };
  const message = error
    ? `${context} failed: ${error.message}`
    : `${context} returned no count, so the query did not ask for one`;
  console.error(message);
  Sentry.captureException(new Error(message), {
    tags: { db_operation: context },
  });
  return { ok: false, error: userMessage };
}

/** The count, or a throw for the route's error boundary. See toTypedCount. */
export async function unwrapCountOrThrow(
  result: Awaitable<DbCountLike>,
  context: string,
): Promise<number> {
  const { count, error } = await result;
  if (!error && count !== null) return count;
  const message = error
    ? `${context} could not be read: ${error.message}`
    : `${context} returned no count, so the query did not ask for one`;
  console.error(message);
  throw new Error(message);
}
