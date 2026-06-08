// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  collectReferencedPaths: vi.fn(),
  listAllBlogImages: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: h.verifyCronAuth }));
vi.mock("@/lib/blog/image-gc", () => ({
  collectReferencedPaths: h.collectReferencedPaths,
  listAllBlogImages: h.listAllBlogImages,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ remove: h.remove }) },
  }),
}));

import { GET } from "./route";

const req = {} as Parameters<typeof GET>[0];
// Two objects old enough to clear any grace window.
const OLD = "2020-01-01T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  h.remove.mockResolvedValue({ error: null });
});

describe("blog-image-gc cron", () => {
  it("returns the unauthorized response when the bearer is missing", async () => {
    const unauth = { status: 401 };
    h.verifyCronAuth.mockReturnValue(unauth);
    expect(await GET(req)).toBe(unauth);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("aborts without deleting if posts cannot be read", async () => {
    h.verifyCronAuth.mockReturnValue(null);
    h.collectReferencedPaths.mockRejectedValue(new Error("db down"));
    const res = await GET(req);
    expect(res.status).toBe(500);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("deletes only old unreferenced objects", async () => {
    h.verifyCronAuth.mockReturnValue(null);
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
    h.verifyCronAuth.mockReturnValue(null);
    h.collectReferencedPaths.mockResolvedValue(new Set(["blog/2026/keep.png"]));
    h.listAllBlogImages.mockResolvedValue([
      { path: "blog/2026/keep.png", createdAt: OLD },
    ]);
    const res = await GET(req);
    expect(await res.json()).toEqual({ scanned: 1, removed: 0 });
    expect(h.remove).not.toHaveBeenCalled();
  });
});
