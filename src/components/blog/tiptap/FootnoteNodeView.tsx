import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/utils";

/**
 * Editor view of a footnote: a small superscript marker. Click it to edit
 * the text; an empty footnote is flagged in red (it is dropped from the
 * published post, so it should not pass silently). The public renderer
 * assigns the visible number.
 */
export function FootnoteNodeView({ node, updateAttributes }: NodeViewProps) {
  const text = (node.attrs.text as string) ?? "";
  const empty = !text.trim();

  return (
    <NodeViewWrapper as="sup" className="font-medium">
      <button
        type="button"
        contentEditable={false}
        title={
          empty
            ? "Empty footnote (hidden on the published post) — click to add text"
            : `${text}\n\nClick to edit`
        }
        onClick={() => {
          const v = window.prompt("Footnote text", text);
          if (v !== null) updateAttributes({ text: v.trim() });
        }}
        className={cn(
          "cursor-pointer rounded px-0.5 text-xs",
          empty ? "bg-error/15 text-error" : "text-teal-dark hover:bg-teal/10",
        )}
      >
        {empty ? "[fn: empty]" : "[fn]"}
      </button>
    </NodeViewWrapper>
  );
}
