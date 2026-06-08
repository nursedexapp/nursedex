import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { EmbedNodeView } from "./EmbedNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (attrs: { url: string }) => ReturnType;
    };
  }
}

/**
 * A block embed node storing the original provider URL in `attrs.url`. The
 * editor shows a lightweight card (EmbedNodeView); the public renderer
 * validates the URL and emits the iframe (see src/lib/blog/embed.ts and
 * the "embed" case in render.tsx).
 */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { url: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-embed-url]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-embed-url": HTMLAttributes.url })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "embed", attrs }),
    };
  },
});
