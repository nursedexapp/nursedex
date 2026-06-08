import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * Editor view of a footnote: a small superscript marker. The footnote text
 * is shown on hover; the public renderer assigns the visible number.
 */
export function FootnoteNodeView({ node }: NodeViewProps) {
  const text = (node.attrs.text as string) ?? "";
  return (
    <NodeViewWrapper
      as="sup"
      title={text}
      className="text-teal-dark cursor-help font-medium"
    >
      [fn]
    </NodeViewWrapper>
  );
}
