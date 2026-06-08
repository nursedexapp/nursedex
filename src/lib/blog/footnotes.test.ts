// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { TiptapDoc } from "@/types/database";
import { collectFootnotes } from "./footnotes";

function fn(text: string) {
  return { type: "footnote", attrs: { text } };
}

describe("collectFootnotes", () => {
  it("numbers footnotes 1..N in document order, across paragraphs", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }, fn("first")] },
        { type: "paragraph", content: [fn("second"), { type: "text", text: "b" }] },
      ],
    } as TiptapDoc;
    expect(collectFootnotes(doc)).toEqual([
      { number: 1, text: "first" },
      { number: 2, text: "second" },
    ]);
  });

  it("skips empty footnotes and handles an empty doc", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [fn("  "), fn("kept")] }],
    } as TiptapDoc;
    expect(collectFootnotes(doc)).toEqual([{ number: 1, text: "kept" }]);
    expect(collectFootnotes(null)).toEqual([]);
  });
});
