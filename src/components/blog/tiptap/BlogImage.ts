import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { BlogImageNodeView } from "./BlogImageNodeView";

/**
 * The base Image extension plus width/height (captured on upload, so the
 * renderer can use next/image), caption, and align attributes. A React node
 * view lets authors change alignment and edit the alt text/caption inline.
 */
export const BlogImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      caption: { default: null },
      align: { default: null },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlogImageNodeView);
  },
});
