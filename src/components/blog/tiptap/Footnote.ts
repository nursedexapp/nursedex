import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FootnoteNodeView } from "./FootnoteNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      setFootnote: (attrs: { text: string }) => ReturnType;
    };
  }
}

/**
 * An inline footnote: stores its text in attrs.text. The editor shows a
 * small superscript marker (FootnoteNodeView); the public renderer numbers
 * footnotes in document order and emits the references and the footnotes
 * section (see src/lib/blog/footnotes.ts and render.tsx).
 */
export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { text: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { "data-footnote": "" }), "[fn]"];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteNodeView);
  },

  addCommands() {
    return {
      setFootnote:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "footnote", attrs }),
    };
  },
});
