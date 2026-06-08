import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  RectangleHorizontal,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Pencil,
  Captions,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { imageAlignClass, type ImageAlign } from "@/lib/blog/image-align";

const ALIGNMENTS: {
  value: ImageAlign;
  label: string;
  Icon: typeof RectangleHorizontal;
}[] = [
  { value: "full", label: "Full width", Icon: RectangleHorizontal },
  { value: "center", label: "Center", Icon: AlignCenter },
  { value: "left", label: "Float left", Icon: AlignLeft },
  { value: "right", label: "Float right", Icon: AlignRight },
];

/**
 * Editor view of a body image: shows it at the chosen alignment, with an
 * overlay (when selected) to change alignment, edit the alt text and
 * caption, or remove it. Attributes are read by the public renderer.
 */
export function BlogImageNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) ?? "";
  const caption = (node.attrs.caption as string) ?? "";
  const align = (node.attrs.align as ImageAlign | null) ?? "full";

  const ctrl =
    "inline-flex size-7 items-center justify-center rounded hover:bg-white/20";

  return (
    <NodeViewWrapper className="clear-both my-4">
      <figure className={cn("relative", imageAlignClass(align))}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={cn(
            "w-full rounded-lg",
            selected && "ring-teal ring-2 ring-offset-2",
          )}
        />
        {caption && (
          <figcaption className="text-soft-black-light mt-1 text-center text-sm">
            {caption}
          </figcaption>
        )}

        {selected && (
          <div
            contentEditable={false}
            className="bg-soft-black/85 absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-md p-1 text-white"
          >
            {ALIGNMENTS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={align === value}
                onClick={() =>
                  updateAttributes({ align: value === "full" ? null : value })
                }
                className={cn(ctrl, align === value && "bg-white/25")}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <span className="mx-0.5 h-5 w-px bg-white/30" />
            <button
              type="button"
              aria-label="Edit alt text"
              onClick={() => {
                const v = window.prompt("Alt text (for accessibility)", alt);
                if (v !== null) updateAttributes({ alt: v });
              }}
              className={ctrl}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Edit caption"
              onClick={() => {
                const v = window.prompt("Caption (optional)", caption);
                if (v !== null) updateAttributes({ caption: v.trim() || null });
              }}
              className={ctrl}
            >
              <Captions className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => deleteNode()}
              className={ctrl}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </figure>
    </NodeViewWrapper>
  );
}
