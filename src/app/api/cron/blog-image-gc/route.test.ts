// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cronRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

const h = vi.hoisted(() => ({
  collectReferencedPaths: vi.fn(),
  listAllBlogImages: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/blog/image-gc", () => ({
  collectReferencedPaths: h.collectReferencedPaths,
  listAllBlogImages: h.listAllBlogImages,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ remove: h.remove }) },
  }),
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const req = cronRequest();
// Two objects old enough to clear any grace window.
const OLD = "2020-01-01T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  h.remove.mockResolvedValue({ error: null });
});

describe("blog-image-gc cron", () => {
  // Previously this test stubbed verifyCronAuth and asserted the route returned
  // the stub's own 401 object: circular, and blind to the real secret check.
  describeCronAuthGuard({
    GET,
    // An orphan ready to be deleted: this cron destroys storage objects, so an
    // unauthenticated caller reaching the handler would delete real files.
    seedSideEffect: () => {
      h.collectReferencedPaths.mockResolvedValue(new Set<string>());
      h.listAllBlogImages.mockResolvedValue([
        { path: "blog/2026/orphan.png", createdAt: OLD },
      ]);
    },
    sideEffectSpies: {
      listAllBlogImages: h.listAllBlogImages,
      remove: h.remove,
    },
  });

  it("aborts without deleting if posts cannot be read", async () => {
    h.collectReferencedPaths.mockRejectedValue(new Error("db down"));
    const res = await GET(req);
    expect(res.status).toBe(500);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("deletes only old unreferenced objects", async () => {
    h.collectReferencedPaths.mockResolvedValue(
      new Set(["blog/2026/keep.png"]),
    );
    h.listAllBlogImages.mockResolvedValue([
      { path: "blog/2026/keep.png", createdAt: OLD },
      { path: "blog/2026/orphan.png", createdAt: OLD },
    ]);

    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({ scanned: 2, removed: 1 });
    expect(h.remove).toHaveBeenCalledWith(["blog/2026/orphan.png"]);
  });

  it("does not call remove when there are no orphans", async () => {
    h.collectReferencedPaths.mockResolvedValue(new Set(["blog/2026/keep.png"]));
    h.listAllBlogImages.mockResolvedValue([
      { path: "blog/2026/keep.png", createdAt: OLD },
    ]);
    const res = await GET(req);
    expect(await res.json()).toEqual({ scanned: 1, removed: 0 });
    expect(h.remove).not.toHaveBeenCalled();
  });
});
