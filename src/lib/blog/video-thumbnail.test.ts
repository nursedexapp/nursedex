// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { thumbnailUpstreamUrl, videoThumbnailPath } from "./video-thumbnail";

describe("thumbnailUpstreamUrl", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("builds YouTube's preview address without a network call", async () => {
    const fetchFn = vi.fn();
    await expect(
      thumbnailUpstreamUrl("youtube", "abcdefghijk", fetchFn),
    ).resolves.toEqual({
      url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("asks Vimeo's oEmbed for the preview address", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            thumbnail_url: "https://i.vimeocdn.com/video/1-d_1280",
          }),
        ),
    );
    await expect(
      thumbnailUpstreamUrl("vimeo", "123", fetchFn),
    ).resolves.toEqual({ url: "https://i.vimeocdn.com/video/1-d_1280" });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123&width=1280",
      expect.anything(),
    );
  });

  it("refuses an id of the wrong shape before any request", async () => {
    const fetchFn = vi.fn();
    await expect(
      thumbnailUpstreamUrl("youtube", "../../etc", fetchFn),
    ).resolves.toEqual({ refused: true });
    await expect(
      thumbnailUpstreamUrl("vimeo", "12a", fetchFn),
    ).resolves.toEqual({ refused: true });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled(); // only probers send these (L498)
  });

  it("refuses a Vimeo answer that points anywhere but Vimeo's image host", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ thumbnail_url: "https://evil.example/x.jpg" }),
        ),
    );
    await expect(
      thumbnailUpstreamUrl("vimeo", "123", fetchFn),
    ).resolves.toEqual({ failed: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].map(String).join(" ")).toContain("evil.example");
  });

  it("warns, naming provider, id and reason, on every Vimeo failure branch", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => new Response("", { status: 500 }),
      async () => new Response("not json"),
      async () => new Response(JSON.stringify({})),
      async () => {
        throw new Error("timeout");
      },
    ];
    for (const c of cases) {
      warn.mockClear();
      await expect(
        thumbnailUpstreamUrl("vimeo", "123", vi.fn(c)),
      ).resolves.toEqual({ failed: true });
      expect(warn).toHaveBeenCalledTimes(1);
      const args = warn.mock.calls[0].map(String).join(" ");
      expect(args).toContain("vimeo");
      expect(args).toContain("123");
    }
  });

  it("treats an oEmbed 404 or 403 as a video with no preview, still warning", async () => {
    for (const status of [404, 403]) {
      warn.mockClear();
      await expect(
        thumbnailUpstreamUrl(
          "vimeo",
          "123",
          vi.fn(async () => new Response("", { status })),
        ),
      ).resolves.toEqual({ absent: true });
      expect(warn).toHaveBeenCalledTimes(1);
    }
  });

  it("reports a failure when Vimeo errors, answers nonsense or throws", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => new Response("", { status: 500 }),
      async () => new Response("not json"),
      async () => {
        throw new Error("network");
      },
    ];
    for (const c of cases) {
      await expect(
        thumbnailUpstreamUrl("vimeo", "123", vi.fn(c)),
      ).resolves.toEqual({ failed: true });
    }
  });
});

describe("videoThumbnailPath", () => {
  it("is a NurseDex path carrying the server's signature", () => {
    expect(videoThumbnailPath("youtube", "abcdefghijk", "sig_-1")).toBe(
      "/api/video-thumbnail/youtube/abcdefghijk?t=sig_-1",
    );
  });
});
