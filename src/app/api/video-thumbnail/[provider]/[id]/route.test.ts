// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deps } from "@/lib/blog/video-thumbnail";
import { GET } from "./route";

const original = deps.fetch;
const fetchMock = vi.fn();

function call(provider: string, id: string) {
  return GET(new Request("https://nursedex.com/api/video-thumbnail"), {
    params: Promise.resolve({ provider, id }),
  });
}

describe("GET /api/video-thumbnail/[provider]/[id]", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockReset();
    deps.fetch = fetchMock as unknown as typeof fetch;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    deps.fetch = original;
    warn.mockRestore();
  });

  it("streams the upstream image with a public cache header", async () => {
    fetchMock.mockResolvedValue(
      new Response("IMGBYTES", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toContain("s-maxage");
    expect(await res.text()).toBe("IMGBYTES");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    );
  });

  it("returns 404 for an unknown provider without fetching", async () => {
    const res = await call("evil", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed id without fetching", async () => {
    const res = await call("youtube", "../../etc");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 and warns when the upstream refuses", async () => {
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 404,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(warn).toHaveBeenCalled();
  });

  it("returns 404 when the upstream is not an image", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
  });

  it("returns 404, not a thrown error, when the fetch itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(warn).toHaveBeenCalled();
  });

  it("serves a Vimeo preview end to end: oEmbed, then the image", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            thumbnail_url: "https://i.vimeocdn.com/video/1-d_1280",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response("VIMEOBYTES", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    const res = await call("vimeo", "123");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("VIMEOBYTES");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "https://vimeo.com/api/oembed.json",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://i.vimeocdn.com/video/1-d_1280",
    );
  });

  it("returns a cached 404 and warns when Vimeo's oEmbed says 404 or 403", async () => {
    for (const status of [404, 403]) {
      warn.mockClear();
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(new Response("", { status }));
      const res = await call("vimeo", "123");
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("public, s-maxage=3600");
      expect(warn).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("returns an uncached 404 when Vimeo's oEmbed errors with 500", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    const res = await call("vimeo", "123");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts jpeg, png and webp only, refusing svg and the rest with a warning", async () => {
    for (const ok of ["image/jpeg", "image/png", "image/webp"]) {
      fetchMock.mockResolvedValueOnce(
        new Response("x", { headers: { "content-type": ok } }),
      );
      expect((await call("youtube", "abcdefghijk")).status).toBe(200);
    }
    for (const bad of ["image/svg+xml", "image/gif", "image/x-icon"]) {
      warn.mockClear();
      fetchMock.mockResolvedValueOnce(
        new Response("x", { headers: { "content-type": bad } }),
      );
      expect((await call("youtube", "abcdefghijk")).status).toBe(404);
      expect(warn).toHaveBeenCalled();
    }
  });

  it("lets the CDN absorb repeat views when the upstream says 404", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=3600");
  });

  it("does not cache a 404 caused by a timeout or thrown error", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("does not cache a 404 for a refused upstream status other than 404", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const res = await call("youtube", "abcdefghijk");
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
