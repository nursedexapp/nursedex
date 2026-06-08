import Image from "@tiptap/extension-image";

/**
 * The base Image extension plus width/height attributes, captured at upload
 * time, so the public renderer can use next/image (responsive, optimized,
 * no layout shift). Images without dimensions fall back to a plain <img>.
 */
export const BlogImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      caption: { default: null },
    };
  },
});
