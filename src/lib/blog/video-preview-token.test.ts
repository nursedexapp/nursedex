// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  signVideoPreview,
  videoPreviewIsSigned,
  videoPreviewPaths,
} from "./video-preview-token";
import { encodePhotoToken } from "@/lib/profile/photo-token";
import type { TiptapDoc } from "@/types/database";

describe("video preview signatures", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-key-for-video-previews");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts what it signed, and is the same every time", () => {
    const token = signVideoPreview("youtube", "abcdefghijk");
    expect(signVideoPreview("youtube", "abcdefghijk")).toBe(token);
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", token)).toBe(true);
  });

  it("refuses a missing, tampered or foreign signature", () => {
    const token = signVideoPreview("youtube", "abcdefghijk");
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", null)).toBe(false);
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", "")).toBe(false);
    const flipped = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", flipped)).toBe(false);
    expect(videoPreviewIsSigned("youtube", "zzzzzzzzzzz", token)).toBe(false);
    expect(videoPreviewIsSigned("vimeo", "abcdefghijk", token)).toBe(false);
  });

  it("refuses a nurse photo token, which is keyed apart", () => {
    const photo = encodePhotoToken("youtube/abcdefghijk");
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", photo)).toBe(false);
  });

  it("refuses everything when no key is configured, rather than throwing", () => {
    const token = signVideoPreview("youtube", "abcdefghijk");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(videoPreviewIsSigned("youtube", "abcdefghijk", token)).toBe(false);
  });

  it("gives every video in a post its signed preview path, nested ones included", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        { type: "embed", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } },
        {
          type: "blockquote",
          content: [
            { type: "embed", attrs: { url: "https://vimeo.com/123456" } },
          ],
        },
        { type: "embed", attrs: { url: "https://evil.com/embed/x" } },
      ],
    };
    const paths = videoPreviewPaths(doc);
    expect(Object.keys(paths).sort()).toEqual([
      "vimeo/123456",
      "youtube/dQw4w9WgXcQ",
    ]);
    expect(paths["youtube/dQw4w9WgXcQ"]).toBe(
      `/api/video-thumbnail/youtube/dQw4w9WgXcQ?t=${signVideoPreview("youtube", "dQw4w9WgXcQ")}`,
    );
  });

  it("gives no previews, and logs, when signing is impossible, so the post still renders", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        { type: "embed", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } },
      ],
    };
    expect(videoPreviewPaths(doc)).toEqual({});
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
