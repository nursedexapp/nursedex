// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const order = vi.fn();
const eqStatus = vi.fn();
const select = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

import { getPublishedPosts } from "./queries";

describe("getPublishedPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.mockResolvedValue({ data: [{ id: "1", status: "published" }], error: null });
    eqStatus.mockReturnValue({ order });
    select.mockReturnValue({ eq: eqStatus });
    from.mockReturnValue({ select });
  });

  it("filters to published and orders by publish_at desc", async () => {
    const posts = await getPublishedPosts();
    expect(from).toHaveBeenCalledWith("blog_posts");
    expect(eqStatus).toHaveBeenCalledWith("status", "published");
    expect(order).toHaveBeenCalledWith("publish_at", { ascending: false });
    expect(posts).toHaveLength(1);
  });

  it("returns an empty array on error", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getPublishedPosts()).toEqual([]);
  });
});
