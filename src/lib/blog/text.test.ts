// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { TiptapDoc } from "@/types/database";
import {
  extractPlainText,
  readingTimeMinutes,
  readingTimeFromText,
} from "./text";

function docOf(words: number): TiptapDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: Array(words).fill("word").join(" ") }],
      },
    ],
  };
}

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

describe("readingTimeMinutes", () => {
  it("is at least 1 minute, even for empty or tiny posts", () => {
    expect(readingTimeMinutes(null)).toBe(1);
    expect(readingTimeMinutes(docOf(5))).toBe(1);
  });

  it("rounds up to whole minutes at ~220 wpm", () => {
    expect(readingTimeMinutes(docOf(220))).toBe(1);
    expect(readingTimeMinutes(docOf(221))).toBe(2);
    expect(readingTimeMinutes(docOf(660))).toBe(3);
  });
});

describe("readingTimeFromText", () => {
  it("counts words from flattened text (the stored content_text)", () => {
    expect(readingTimeFromText("")).toBe(1);
    expect(readingTimeFromText(null)).toBe(1);
    expect(readingTimeFromText("word ".repeat(220).trim())).toBe(1);
    expect(readingTimeFromText("word ".repeat(221).trim())).toBe(2);
  });
});
