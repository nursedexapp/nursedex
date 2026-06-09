// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BlogImage } from "./BlogImage";
import { Embed } from "./Embed";
import { Footnote } from "./Footnote";

// A headless editor with the blog's custom extensions. Needs a DOM, which is
// why this spec runs under happy-dom rather than the default node environment.
function makeEditor(content?: object) {
  return new Editor({
    extensions: [StarterKit, BlogImage, Embed, Footnote],
    content,
  });
}

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("blog tiptap extensions", () => {
  it("round-trips BlogImage attributes through getJSON", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://cdn.example.com/a.jpg",
            width: 800,
            height: 600,
            caption: "A caption",
            align: "center",
          },
        },
      ],
    });

    const image = editor.getJSON().content?.[0];
    expect(image?.type).toBe("image");
    expect(image?.attrs).toMatchObject({
      src: "https://cdn.example.com/a.jpg",
      width: 800,
      height: 600,
      caption: "A caption",
      align: "center",
    });
  });

  it("inserts an embed via setEmbed and preserves its url", () => {
    editor = makeEditor();
    editor.commands.setEmbed({ url: "https://www.youtube.com/watch?v=abc123" });

    const embed = editor
      .getJSON()
      .content?.find((node) => node.type === "embed");
    expect(embed).toBeDefined();
    expect(embed?.attrs?.url).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("inserts an inline footnote via setFootnote and preserves its text", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
    });
    editor.commands.setFootnote({ text: "A footnote body." });

    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"footnote"');
    expect(json).toContain("A footnote body.");
  });

  it("defaults missing BlogImage attributes to null", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://cdn.example.com/b.jpg" } },
      ],
    });

    const image = editor.getJSON().content?.[0];
    expect(image?.attrs).toMatchObject({
      width: null,
      height: null,
      caption: null,
      align: null,
    });
  });
});
