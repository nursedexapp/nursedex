// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const range = vi.fn();
const order = vi.fn();
const textSearch = vi.fn();
const eqStatus = vi.fn();
const select = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

import {
  getPublishedPostsPage,
  searchPublishedPosts,
  BLOG_PAGE_SIZE,
} from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  range.mockResolvedValue({
    data: [{ id: "1", status: "published" }],
    count: 1,
    error: null,
  });
  // order() is chainable (pinned, then publish_at) and ends in range().
  order.mockReturnValue({ order, range });
  textSearch.mockReturnValue({ order });
  eqStatus.mockReturnValue({ order, textSearch });
  select.mockReturnValue({ eq: eqStatus });
  from.mockReturnValue({ select });
});

describe("getPublishedPostsPage", () => {
  it("filters to published, orders by publish_at desc, and counts exactly", async () => {
    await getPublishedPostsPage(1);
    expect(from).toHaveBeenCalledWith("blog_posts");
    expect(select).toHaveBeenCalledWith("*", { count: "exact" });
    expect(eqStatus).toHaveBeenCalledWith("status", "published");
    expect(order).toHaveBeenCalledWith("pinned", { ascending: false });
    expect(order).toHaveBeenCalledWith("publish_at", { ascending: false });
  });

  it("requests the correct range for page 1", async () => {
    await getPublishedPostsPage(1);
    expect(range).toHaveBeenCalledWith(0, BLOG_PAGE_SIZE - 1);
  });

  it("requests the correct range for a later page", async () => {
    await getPublishedPostsPage(3);
    expect(range).toHaveBeenCalledWith(BLOG_PAGE_SIZE * 2, BLOG_PAGE_SIZE * 3 - 1);
  });

  it("clamps invalid pages to 1", async () => {
    await getPublishedPostsPage(0);
    expect(range).toHaveBeenCalledWith(0, BLOG_PAGE_SIZE - 1);
    range.mockClear();
    await getPublishedPostsPage(NaN);
    expect(range).toHaveBeenCalledWith(0, BLOG_PAGE_SIZE - 1);
  });

  it("derives totalPages from the count", async () => {
    range.mockResolvedValue({ data: [], count: 20, error: null });
    const res = await getPublishedPostsPage(1, 9);
    expect(res.total).toBe(20);
    expect(res.totalPages).toBe(3);
  });

  it("returns an empty page on error", async () => {
    range.mockResolvedValue({ data: null, count: null, error: { message: "boom" } });
    const res = await getPublishedPostsPage(1);
    expect(res.posts).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.totalPages).toBe(0);
  });
});

describe("searchPublishedPosts", () => {
  it("filters to published, runs a websearch text search, and paginates", async () => {
    await searchPublishedPosts("home care", 1);
    expect(eqStatus).toHaveBeenCalledWith("status", "published");
    expect(textSearch).toHaveBeenCalledWith("search_vector", "home care", {
      type: "websearch",
      config: "english",
    });
    expect(order).toHaveBeenCalledWith("publish_at", { ascending: false });
    expect(range).toHaveBeenCalledWith(0, BLOG_PAGE_SIZE - 1);
  });

  it("returns an empty page on error", async () => {
    range.mockResolvedValue({ data: null, count: null, error: { message: "boom" } });
    const res = await searchPublishedPosts("x", 1);
    expect(res.posts).toEqual([]);
    expect(res.totalPages).toBe(0);
  });
});
