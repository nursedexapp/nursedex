// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlogImage } from "./BlogImage";
import { Embed } from "./Embed";
import { Footnote } from "./Footnote";

// Mounts a real editor with the blog extensions so the React node views
// (BlogImageNodeView / EmbedNodeView / FootnoteNodeView) actually render and
// can be driven, instead of asserting only on getJSON. Runs under happy-dom.
function EditorHarness({
  content,
  editorRef,
}: {
  content: object;
  editorRef: { current: Editor | null };
}) {
  const editor = useEditor({
    extensions: [StarterKit, BlogImage, Embed, Footnote],
    content,
    immediatelyRender: true,
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor, editorRef]);

  return editor ? <EditorContent editor={editor} /> : null;
}

async function mountEditor(content: object) {
  const editorRef: { current: Editor | null } = { current: null };
  render(<EditorHarness content={content} editorRef={editorRef} />);
  await waitFor(() => expect(editorRef.current).not.toBeNull());
  return editorRef.current!;
}

const YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmbedNodeView", () => {
  it("labels a YouTube embed and shows its url", async () => {
    await mountEditor({
      type: "doc",
      content: [{ type: "embed", attrs: { url: YT_URL } }],
    });
    expect(await screen.findByText("YouTube embed")).toBeInTheDocument();
    expect(screen.getByText(YT_URL)).toBeInTheDocument();
  });

  it("labels a Vimeo embed", async () => {
    await mountEditor({
      type: "doc",
      content: [
        { type: "embed", attrs: { url: "https://vimeo.com/123456789" } },
      ],
    });
    expect(await screen.findByText("Vimeo embed")).toBeInTheDocument();
  });

  it("flags an unsupported url", async () => {
    await mountEditor({
      type: "doc",
      content: [{ type: "embed", attrs: { url: "https://example.com/clip" } }],
    });
    expect(await screen.findByText("Unsupported embed")).toBeInTheDocument();
  });

  it("removes the embed when the remove button is clicked", async () => {
    const editor = await mountEditor({
      type: "doc",
      content: [{ type: "embed", attrs: { url: YT_URL } }],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove embed" }),
    );
    await waitFor(() =>
      expect(
        editor.getJSON().content?.some((n) => n.type === "embed"),
      ).toBeFalsy(),
    );
  });
});

describe("FootnoteNodeView", () => {
  it("renders the [fn] marker for a footnote with text", async () => {
    await mountEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hi" },
            { type: "footnote", attrs: { text: "A note." } },
          ],
        },
      ],
    });
    expect(await screen.findByText("[fn]")).toBeInTheDocument();
    expect(screen.queryByText("[fn: empty]")).not.toBeInTheDocument();
  });

  it("flags an empty footnote", async () => {
    await mountEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "footnote", attrs: { text: "" } }],
        },
      ],
    });
    expect(await screen.findByText("[fn: empty]")).toBeInTheDocument();
  });

  it("edits the footnote text via the prompt", async () => {
    // happy-dom has no window.prompt, so stub it rather than spy on it.
    const promptSpy = vi.fn(() => "  edited note  ");
    vi.stubGlobal("prompt", promptSpy);
    const editor = await mountEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "footnote", attrs: { text: "old" } }],
        },
      ],
    });

    fireEvent.click(await screen.findByText("[fn]"));
    expect(promptSpy).toHaveBeenCalled();

    await waitFor(() =>
      expect(JSON.stringify(editor.getJSON())).toContain("edited note"),
    );
  });
});

describe("BlogImageNodeView", () => {
  // A trailing paragraph so the default cursor lands in text, not as a node
  // selection on the lone atom image (which would show the overlay on mount).
  const IMG = {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: {
          src: "https://cdn.example.com/a.jpg",
          alt: "A nurse",
          caption: "On the job",
        },
      },
      { type: "paragraph" },
    ],
  };

  it("renders the image, alt, and caption, with the overlay hidden when not selected", async () => {
    const editor = await mountEditor(IMG);
    const img = await screen.findByRole("img", { name: "A nurse" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/a.jpg");
    expect(screen.getByText("On the job")).toBeInTheDocument();

    // Put the cursor in the trailing paragraph so the image is not selected;
    // the alignment overlay should then be gone.
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size);
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Center" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the overlay and changes alignment when selected", async () => {
    const editor = await mountEditor(IMG);
    act(() => {
      editor.commands.setNodeSelection(0);
    });

    const centerBtn = await screen.findByRole("button", { name: "Center" });
    fireEvent.click(centerBtn);

    await waitFor(() => {
      const image = editor.getJSON().content?.[0];
      expect(image?.attrs?.align).toBe("center");
    });
  });

  it("edits the alt text via the prompt when selected", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "Updated alt"),
    );
    const editor = await mountEditor(IMG);
    act(() => {
      editor.commands.setNodeSelection(0);
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit alt text" }),
    );
    await waitFor(() => {
      const image = editor.getJSON().content?.[0];
      expect(image?.attrs?.alt).toBe("Updated alt");
    });
  });

  it("removes the image when the remove button is clicked", async () => {
    const editor = await mountEditor(IMG);
    act(() => {
      editor.commands.setNodeSelection(0);
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove image" }),
    );
    await waitFor(() =>
      expect(
        editor.getJSON().content?.some((n) => n.type === "image"),
      ).toBeFalsy(),
    );
  });
});
