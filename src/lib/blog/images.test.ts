// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  hasValidImageMagic,
  pathFromPublicUrl,
  collectImagePaths,
  selectOrphanedPaths,
} from "./images";
import type { TiptapDoc } from "@/types/database";

const HOST = "https://abcd.supabase.co";
const pub = (path: string) =>
  `${HOST}/storage/v1/object/public/blog-images/${path}`;

describe("hasValidImageMagic", () => {
  it("accepts JPEG, PNG, and WebP headers", () => {
    expect(hasValidImageMagic(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(
      hasValidImageMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])),
    ).toBe(true);
    expect(
      hasValidImageMagic(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00])),
    ).toBe(true);
  });

  it("rejects non-image content", () => {
    expect(hasValidImageMagic(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBe(false); // <svg
    expect(hasValidImageMagic(new Uint8Array([0x00, 0x00, 0x00]))).toBe(false);
    expect(hasValidImageMagic(new Uint8Array([]))).toBe(false);
  });
});

describe("pathFromPublicUrl", () => {
  it("extracts the object path from a bucket public URL", () => {
    expect(pathFromPublicUrl(pub("blog/2026/a.jpg"))).toBe("blog/2026/a.jpg");
  });

  it("strips query and hash suffixes", () => {
    expect(pathFromPublicUrl(pub("blog/2026/a.jpg?v=2"))).toBe("blog/2026/a.jpg");
  });

  it("returns null for external or empty URLs", () => {
    expect(pathFromPublicUrl("https://evil.com/x.png")).toBeNull();
    expect(pathFromPublicUrl(null)).toBeNull();
    expect(pathFromPublicUrl(undefined)).toBeNull();
  });
});

describe("collectImagePaths", () => {
  it("gathers the cover and inline image paths, ignoring external ones", () => {
    const content: TiptapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hi" }] },
        { type: "image", attrs: { src: pub("blog/2026/inline.png") } },
        { type: "image", attrs: { src: "https://external.com/x.png" } },
      ],
    };
    const paths = collectImagePaths({
      cover_image_url: pub("blog/2026/cover.jpg"),
      content,
    });
    expect(paths.sort()).toEqual([
      "blog/2026/cover.jpg",
      "blog/2026/inline.png",
    ]);
  });

  it("dedupes repeated references and handles a missing cover/content", () => {
    const content: TiptapDoc = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: pub("blog/2026/x.png") } },
        { type: "image", attrs: { src: pub("blog/2026/x.png") } },
      ],
    };
    expect(collectImagePaths({ cover_image_url: null, content })).toEqual([
      "blog/2026/x.png",
    ]);
    expect(collectImagePaths({})).toEqual([]);
  });
});

describe("selectOrphanedPaths", () => {
  const NOW = new Date("2026-06-08T00:00:00.000Z").getTime();
  const GRACE = 24 * 60 * 60 * 1000;
  const old = "2026-06-01T00:00:00.000Z"; // 7 days old
  const recent = "2026-06-07T18:00:00.000Z"; // 6 hours old

  it("removes old unreferenced objects only", () => {
    const objects = [
      { path: "blog/2026/referenced.png", createdAt: old },
      { path: "blog/2026/orphan.png", createdAt: old },
      { path: "blog/2026/fresh.png", createdAt: recent },
    ];
    const referenced = new Set(["blog/2026/referenced.png"]);
    expect(selectOrphanedPaths(objects, referenced, NOW, GRACE)).toEqual([
      "blog/2026/orphan.png",
    ]);
  });

  it("keeps objects with an unknown creation time", () => {
    const objects = [{ path: "blog/2026/mystery.png", createdAt: null }];
    expect(selectOrphanedPaths(objects, new Set(), NOW, GRACE)).toEqual([]);
  });
});
