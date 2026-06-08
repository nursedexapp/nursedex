import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseEmbed } from "@/lib/blog/embed";

/**
 * Editor view of an embed: a compact card (not a live iframe) showing the
 * provider and URL, with a remove button. The actual video renders on the
 * public post page.
 */
export function EmbedNodeView({ node, deleteNode, selected }: NodeViewProps) {
  const url = (node.attrs.url as string) ?? "";
  const parsed = parseEmbed(url);

  return (
    <NodeViewWrapper className="my-4">
      <div
        className={cn(
          "border-border bg-warm-white flex items-center gap-3 rounded-md border p-3 text-sm",
          selected && "ring-teal ring-2",
        )}
      >
        <Video className="text-soft-black-light size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-soft-black font-medium">
            {parsed
              ? `${parsed.provider === "youtube" ? "YouTube" : "Vimeo"} embed`
              : "Unsupported embed"}
          </p>
          <p className="text-soft-black-light truncate text-xs">{url}</p>
        </div>
        <button
          type="button"
          onClick={() => deleteNode()}
          aria-label="Remove embed"
          className="text-soft-black-light hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
