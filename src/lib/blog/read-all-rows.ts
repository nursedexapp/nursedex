/**
 * Read every row of a paginated source, or refuse (#745).
 *
 * The blog image GC deletes every storage object that no post references. It
 * already aborts when it cannot READ the posts. The gap was the read that
 * SUCCEEDS and comes back short: PostgREST caps an unbounded select, so once
 * the blog passed that cap `collectReferencedPaths` would have returned a
 * healthy-looking subset, everything missing from it would have looked
 * unreferenced, and the nightly sweep would have permanently deleted real
 * images. Storage deletion has no undo.
 *
 * The guarantee here is deliberately not a floor or a "does this look like a
 * sudden drop" heuristic. Those need tuning, and a threshold sitting inside the
 * normal range of a growing blog produces both false alarms and false calm.
 * This instead refuses to hand back any rows unless the source's own count
 * proves they are all of them. A caller either gets the complete set or an
 * exception, and there is no third state for a deletion to be computed from.
 */
export async function readAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ rows: T[]; total: number | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  let expected: number | null = null;
  let pages = 0;

  for (;;) {
    pages++;
    // A throw here propagates on purpose. Returning what we happened to collect
    // before a failure is precisely the short read this exists to prevent.
    const { rows, total } = await fetchPage(from, from + pageSize - 1);

    if (total === null || total === undefined) {
      throw new Error(
        "Cannot verify the read is complete: the source reported no total row " +
          "count. Refusing to return a set that might be partial, because the " +
          "caller deletes whatever is missing from it.",
      );
    }
    expected = total;

    // A source that keeps returning pages far smaller than the one requested
    // would take one round trip per row. That presents as a hang rather than a
    // failure, and a hang is the worse outcome: indistinguishable from slowness,
    // and it holds the job open. Bounded against the pages the REQUESTED size
    // implies, plus slack, so a deliberately small page size stays legal.
    const maxPages = Math.ceil(total / pageSize) + 5;
    if (pages > maxPages) {
      throw new Error(
        `Source is not delivering full pages: took more than ${maxPages} pages ` +
          `to read ${total} rows at a page size of ${pageSize}. Refusing rather ` +
          "than continuing to spin.",
      );
    }

    out.push(...rows);

    if (out.length >= expected) break;

    // A page that came back empty while rows are still outstanding means the
    // source stopped early. Without this the loop would spin forever, which is
    // worse than failing: a hang is indistinguishable from slowness.
    if (rows.length === 0) break;

    from += rows.length;
  }

  if (expected !== null && out.length !== expected) {
    throw new Error(
      `Incomplete read: read ${out.length} of ${expected} rows. Refusing to ` +
        "continue, because the caller treats anything missing from this set as " +
        "unreferenced and deletes it.",
    );
  }

  return out;
}
