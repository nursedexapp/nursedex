// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { TiptapDoc } from "@/types/database";

// toc -> slug -> service-role imports "server-only", which is unresolvable
// under vitest; stub it so the pure helpers can be imported.
vi.mock("server-only", () => ({}));

import { extractHeadings, nodeText } from "./toc";

function heading(level: number, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

describe("nodeText", () => {
  it("joins a node's text descendants", () => {
    expect(
      nodeText({
        type: "heading",
        content: [
          { type: "text", text: "Finding a " },
          { type: "text", text: "Nurse", marks: [{ type: "bold" }] },
        ],
      }),
    ).toBe("Finding a Nurse");
  });
});

describe("extractHeadings", () => {
  it("collects headings in order with levels and de-duplicated ids", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        heading(2, "Intro"),
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
        heading(3, "Details"),
        heading(2, "Intro"),
      ] as TiptapDoc["content"],
    };
    expect(extractHeadings(doc)).toEqual([
      { level: 2, text: "Intro", id: "intro" },
      { level: 3, text: "Details", id: "details" },
      { level: 2, text: "Intro", id: "intro-1" },
    ]);
  });

  it("skips empty headings and handles an empty doc", () => {
    expect(
      extractHeadings({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 }, content: [] }],
      } as TiptapDoc),
    ).toEqual([]);
    expect(extractHeadings(null)).toEqual([]);
  });
});
