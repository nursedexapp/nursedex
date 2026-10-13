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
      new Response("IMGBYTES", { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toContain("s-maxage");
    expect(await res.text()).toBe("IMGBYTES");
    expect(fetchMock.mock.calls[0][0]).toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
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
    fetchMock.mockResolvedValue(new Response("", { status: 404, headers: { "content-type": "image/jpeg" } }));
    const res = await call("youtube", "abcdefghijk");
    expect(res.status).toBe(404);
    expect(warn).toHaveBeenCalled();
  });

  it("returns 404 when the upstream is not an image", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
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
});
