// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { TiptapDoc } from "@/types/database";
import { extractPlainText } from "./text";

describe("extractPlainText", () => {
  it("flattens headings, paragraphs, and lists to text", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Finding a Nurse" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Home care " },
            { type: "text", text: "in New York", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Licensing" }] }],
            },
          ],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe(
      "Finding a Nurse Home care in New York Licensing",
    );
  });

  it("collapses whitespace and returns empty for empty input", () => {
    expect(
      extractPlainText({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "  a   b  " }] }],
      }),
    ).toBe("a b");
    expect(extractPlainText({ type: "doc" } as TiptapDoc)).toBe("");
    expect(extractPlainText(null)).toBe("");
  });
});
