// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Admin-only blog image upload, which had no test. The role check was correct,
// but nothing held it in place: dropping it would have let any signed-in user
// (or none) write objects into the blog-images bucket, and no test would have
// failed. Supabase storage RLS is a second line of defence, not a reason to
// leave the first one unverified.
//
// The guard under test is the route's own signed-in + admin-role check, so it
// runs for real, along with the real getCurrentUser. The only seam mocked is the
// Supabase client the session is read through (#634: never mock away the guard
// the test exists to verify).

const h = vi.hoisted(() => {
  const state = { user: null as Record<string, unknown> | null };
  const uploadBlogImage = vi.fn(async () => ({
    url: "https://cdn.example.com/blog/2026/pic.png",
  }));
  return { state, uploadBlogImage };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.state.user ? { id: h.state.user.id } : null },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: h.state.user, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/blog/images", () => ({
  uploadBlogImage: h.uploadBlogImage,
}));

function setCaller(role: string | null) {
  h.state.user =
    role === null
      ? null
      : { id: `caller-${role}`, role, is_suspended: false, is_deleted: false };
}

function req(file: File | null = new File(["png-bytes"], "pic.png")): NextRequest {
  const form = new FormData();
  if (file) form.set("file", file);
  return { formData: async () => form } as unknown as NextRequest;
}

async function loadPost() {
  const { POST } = await import("./route");
  return POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  // getCurrentUser is wrapped in React cache(); a fresh module graph stops one
  // test's caller leaking into the next.
  vi.resetModules();
});

describe("blog image upload: only a signed-in admin may write", () => {
  it("refuses a signed-out caller with 401 and uploads nothing", async () => {
    setCaller(null);
    const POST = await loadPost();

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(h.uploadBlogImage).not.toHaveBeenCalled();
  });

  it.each(["family", "nurse"])(
    "refuses a %s caller with 403 and uploads nothing",
    async (role) => {
      setCaller(role);
      const POST = await loadPost();

      const res = await POST(req());

      expect(res.status).toBe(403);
      expect(h.uploadBlogImage).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "super_admin"])(
    "accepts an upload from a %s and returns the public URL",
    async (role) => {
      setCaller(role);
      const POST = await loadPost();

      const res = await POST(req());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        url: "https://cdn.example.com/blog/2026/pic.png",
      });
      expect(h.uploadBlogImage).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects an admin request carrying no file with 400", async () => {
    setCaller("admin");
    const POST = await loadPost();

    const res = await POST(req(null));

    expect(res.status).toBe(400);
    expect(h.uploadBlogImage).not.toHaveBeenCalled();
  });
});
