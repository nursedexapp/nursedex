import { describe, it, expect } from "vitest";
import { readAllRows } from "./read-all-rows";

// #745. The blog image GC deletes every storage object that no post references.
// It correctly aborts when it cannot READ the posts, but not when the read
// SUCCEEDS and comes back short, and a short referenced-set is exactly what
// makes real images look orphaned. PostgREST caps an unbounded select, so
// collectReferencedPaths was wrong by construction the moment the blog passed
// that cap: it would have reported a healthy-looking subset and the nightly
// sweep would have permanently deleted the difference.
//
// The fix is not a floor or a heuristic. It is refusing to return rows at all
// unless the count proves they are ALL of them.

/** A fake page source, so the guarantee is tested rather than the client. */
function pager(total: number, opts: { stopEarlyAt?: number } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  return async (from: number, to: number) => {
    if (opts.stopEarlyAt !== undefined && from >= opts.stopEarlyAt) {
      return { rows: [], total };
    }
    return { rows: all.slice(from, to + 1), total };
  };
}

describe("readAllRows", () => {
  it("reads every row across multiple pages", async () => {
    const rows = await readAllRows(pager(2500), 1000);
    expect(rows).toHaveLength(2500);
  });

  it("reads a single short page", async () => {
    expect(await readAllRows(pager(3), 1000)).toHaveLength(3);
  });

  it("reads an empty table without complaint", async () => {
    // Genuinely zero rows is a legitimate answer, distinct from a short read.
    expect(await readAllRows(pager(0), 1000)).toEqual([]);
  });

  it("REFUSES when it read fewer rows than the source says exist", async () => {
    // The defect this whole issue is about. Stopping early must never be
    // mistaken for having read everything.
    await expect(
      readAllRows(pager(2500, { stopEarlyAt: 1000 }), 1000),
    ).rejects.toThrow(/read 1000 of 2500/i);
  });

  it("REFUSES when the source cannot say how many rows there are", async () => {
    // Without a total there is nothing to check completeness against, so the
    // result cannot be trusted to be complete. Unverifiable is not the same as
    // complete, and only one of them is safe to delete from.
    await expect(
      readAllRows(async () => ({ rows: [{ id: 1 }], total: null }), 1000),
    ).rejects.toThrow(/cannot verify/i);
  });

  it("propagates a read failure rather than returning what it got", async () => {
    await expect(
      readAllRows(async () => {
        throw new Error("connection reset");
      }, 1000),
    ).rejects.toThrow(/connection reset/);
  });

  it("does not spin when the source dribbles rows far below the page size", async () => {
    // A source asked for 1000 rows that returns 1, while claiming 9999 exist, is
    // broken. Left alone it takes 9999 round trips, which presents as a hang
    // rather than a failure, and a hang is worse: it is indistinguishable from
    // slowness and holds the job open.
    //
    // Note this is NOT the same as a legitimately small page size. Asking for 1
    // and receiving 1 is fine and stays fine. The guard is on pages arriving far
    // smaller than requested, which is why it is expressed against the number of
    // pages the requested size implies rather than against a raw call count.
    let calls = 0;
    await expect(
      readAllRows(async () => {
        calls++;
        return { rows: [{ id: calls }], total: 9999 };
      }, 1000),
    ).rejects.toThrow(/too many pages|not delivering/i);
    expect(calls).toBeLessThan(100);
  });

  it("still allows a genuinely small page size", async () => {
    // The guard above must not punish a caller that deliberately reads in small
    // pages. Asking for 2 at a time and getting 2 is correct behaviour.
    expect(await readAllRows(pager(10), 2)).toHaveLength(10);
  });
});
