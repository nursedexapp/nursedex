// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { thumbnailUpstreamUrl, videoThumbnailPath } from "./video-thumbnail";

describe("thumbnailUpstreamUrl", () => {
  it("builds YouTube's preview address without a network call", async () => {
    const fetchFn = vi.fn();
    await expect(
      thumbnailUpstreamUrl("youtube", "abcdefghijk", fetchFn),
    ).resolves.toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("asks Vimeo's oEmbed for the preview address", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ thumbnail_url: "https://i.vimeocdn.com/video/1-d_1280" }),
        ),
    );
    await expect(thumbnailUpstreamUrl("vimeo", "123", fetchFn)).resolves.toBe(
      "https://i.vimeocdn.com/video/1-d_1280",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123&width=1280",
      expect.anything(),
    );
  });

  it("refuses an id of the wrong shape before any request", async () => {
    const fetchFn = vi.fn();
    await expect(thumbnailUpstreamUrl("youtube", "../../etc", fetchFn)).resolves.toBeNull();
    await expect(thumbnailUpstreamUrl("vimeo", "12a", fetchFn)).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a Vimeo answer that points anywhere but Vimeo's image host", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ thumbnail_url: "https://evil.example/x.jpg" })),
    );
    await expect(thumbnailUpstreamUrl("vimeo", "123", fetchFn)).resolves.toBeNull();
  });

  it("returns null when Vimeo fails or answers nonsense", async () => {
    await expect(
      thumbnailUpstreamUrl("vimeo", "123", vi.fn(async () => new Response("", { status: 404 }))),
    ).resolves.toBeNull();
    await expect(
      thumbnailUpstreamUrl("vimeo", "123", vi.fn(async () => new Response("not json"))),
    ).resolves.toBeNull();
    await expect(
      thumbnailUpstreamUrl(
        "vimeo",
        "123",
        vi.fn(async () => {
          throw new Error("network");
        }),
      ),
    ).resolves.toBeNull();
  });
});

describe("videoThumbnailPath", () => {
  it("is a NurseDex path", () => {
    expect(videoThumbnailPath("youtube", "abcdefghijk")).toBe(
      "/api/video-thumbnail/youtube/abcdefghijk",
    );
  });
});
