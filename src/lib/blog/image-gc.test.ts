// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// #745. These exercise the two reads that drive a destructive sweep, at the
// level where the change actually happened. The cron route tests guard the
// consequence (nothing is deleted when a read fails) but they mock these
// functions, so they cannot see whether these functions report failure at all.

const h = vi.hoisted(() => ({ list: vi.fn(), select: vi.fn() }));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ list: h.list }) },
    from: () => ({
      select: () => ({ range: h.select }),
    }),
  }),
}));

import { listAllBlogImages, collectReferencedPaths } from "./image-gc";

const file = (name: string) => ({
  name,
  id: "an-id",
  created_at: "2020-01-01T00:00:00.000Z",
});

beforeEach(() => vi.clearAllMocks());

describe("listAllBlogImages", () => {
  it("returns every object when the listing succeeds", async () => {
    h.list
      .mockResolvedValueOnce({ data: [file("a.jpg"), file("b.jpg")], error: null })
      .mockResolvedValue({ data: [], error: null });

    const out = await listAllBlogImages();

    expect(out.map((o) => o.path)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("THROWS rather than returning a partial list when the listing fails", async () => {
    // It used to log and return, leaving the collected objects as the answer. A
    // short bucket listing reads exactly like a bucket that genuinely holds
    // fewer files, and every caller took it as complete.
    h.list.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listAllBlogImages()).rejects.toThrow(/boom/);
  });
});

describe("collectReferencedPaths", () => {
  it("REFUSES when the posts read comes back short of the reported total", async () => {
    // The defect that made this issue dangerous. A capped read returns a
    // healthy-looking subset with no error, everything missing from it looks
    // unreferenced, and the sweep deletes it. Storage deletion has no undo.
    // A full first page, then the source stops while claiming 5000 exist. That
    // is the realistic shape of a capped or truncated read, as opposed to one
    // that dribbles rows, which trips a different and separately tested guard.
    const page = Array.from({ length: 1000 }, () => ({
      cover_image_url: null,
      content: null,
    }));
    h.select
      .mockResolvedValueOnce({ data: page, error: null, count: 5000 })
      .mockResolvedValue({ data: [], error: null, count: 5000 });

    await expect(collectReferencedPaths()).rejects.toThrow(/read 1000 of 5000/i);
  });

  it("REFUSES when the source reports no total to check against", async () => {
    h.select.mockResolvedValue({
      data: [{ cover_image_url: null, content: null }],
      error: null,
      count: null,
    });

    await expect(collectReferencedPaths()).rejects.toThrow(/cannot verify/i);
  });

  it("propagates a read error rather than returning an empty set", async () => {
    // An empty set is the single most dangerous value this function can return:
    // it marks every object in the bucket as unreferenced.
    h.select.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
      count: null,
    });

    await expect(collectReferencedPaths()).rejects.toThrow(/connection reset/);
  });

  it("succeeds, and collects the paths, when the read is provably complete", async () => {
    // The positive control. Without it every assertion above is satisfied by a
    // function that simply always throws.
    h.select.mockResolvedValue({
      data: [
        {
          cover_image_url:
            "https://x.supabase.co/storage/v1/object/public/blog-images/blog/2026/a.jpg",
          content: null,
        },
      ],
      error: null,
      count: 1,
    });

    const referenced = await collectReferencedPaths();

    expect(referenced.has("blog/2026/a.jpg")).toBe(true);
  });
});
