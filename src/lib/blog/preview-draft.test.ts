// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  writePreviewDraft,
  readPreviewDraft,
  PREVIEW_TTL_MS,
} from "./preview-draft";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const draft = {
  title: "Draft title",
  excerpt: null,
  content: { type: "doc" as const, content: [] },
  cover_image_url: null,
};

describe("preview draft storage", () => {
  it("round-trips a fresh draft", () => {
    writePreviewDraft("p1", draft);
    expect(readPreviewDraft("p1")).toMatchObject(draft);
  });

  it("returns null for a missing draft", () => {
    expect(readPreviewDraft("nope")).toBeNull();
  });

  it("returns null for a draft older than the TTL", () => {
    writePreviewDraft("p1", draft);
    const stored = JSON.parse(store.get("blog-preview-p1") as string);
    stored.ts = Date.now() - PREVIEW_TTL_MS - 1000;
    store.set("blog-preview-p1", JSON.stringify(stored));
    expect(readPreviewDraft("p1")).toBeNull();
  });
});
