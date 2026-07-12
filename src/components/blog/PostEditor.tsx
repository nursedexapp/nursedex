"use client";

import { useRef, useState } from "react";
import { usePendingPhase } from "@/components/ui/pending-button";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlogImage } from "@/components/blog/tiptap/BlogImage";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  Superscript,
  SquareCode,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Embed } from "@/components/blog/tiptap/Embed";
import { Footnote } from "@/components/blog/tiptap/Footnote";
import { parseEmbed } from "@/lib/blog/embed";
import { CODE_LANGUAGES } from "@/lib/blog/code-languages";
import type { TiptapDoc } from "@/types/database";

interface PostEditorProps {
  value: TiptapDoc | null;
  onChange: (doc: TiptapDoc) => void;
}

const EMPTY_DOC: TiptapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function PostEditor({ value, onChange }: PostEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // The image button is a 32px toolbar icon and cannot carry PendingButton's
  // stall panel, so it borrows the shared clock and speaks through the toolbar
  // (#443 phase 5). wait, not retry: a hung upload can still land and insert its
  // image on top of the retry's, the newest-attempt hole PhotoUpload had to close
  // (#667). Graduating this needs that guard (#669).
  const { phase: uploadPhase } = usePendingPhase({ pending: uploading });
  const uploadStalled = uploadPhase === "stalled";
  // Inline toolbar input (replaces window.prompt) for inserting a link,
  // embed, or footnote. Null when closed.
  const [inline, setInline] = useState<{
    kind: "link" | "embed" | "footnote";
    value: string;
    error: string | null;
  } | null>(null);

  const editor = useEditor({
    // immediatelyRender must be false under Next so the server and first
    // client render match (Tiptap v3 requirement in SSR frameworks).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener nofollow", target: "_blank" },
        },
      }),
      BlogImage,
      Embed,
      Footnote,
    ],
    content: value ?? EMPTY_DOC,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapDoc),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none min-h-64 focus:outline-none",
      },
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      code: editor?.isActive("code") ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      quote: editor?.isActive("blockquote") ?? false,
      link: editor?.isActive("link") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      codeLang:
        (editor?.getAttributes("codeBlock").language as string | null) ?? "",
    }),
  });

  if (!editor || !active) return null;

  function setLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setInline({ kind: "link", value: "", error: null });
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/blog/images", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Image upload failed.");
        return;
      }
      // Insert without forcing alt/caption prompts. The author sets them
      // (optionally) by clicking the image and using its toolbar.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            src: json.url,
            alt: "",
            caption: null,
            width: json.width ?? null,
            height: json.height ?? null,
          },
        })
        .run();
      toast.success("Image added. Click it to set alt text and a caption.");
    } catch {
      toast.error("Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function insertEmbed() {
    setInline({ kind: "embed", value: "", error: null });
  }

  function insertFootnote() {
    setInline({ kind: "footnote", value: "", error: null });
  }

  // Commit the inline input: validate (embed URLs must be YouTube/Vimeo) and
  // insert the node, or surface an inline error.
  function submitInline() {
    if (!inline || !editor) return;
    const v = inline.value.trim();
    if (!v) {
      setInline(null);
      return;
    }
    if (inline.kind === "link") {
      editor.chain().focus().setLink({ href: v }).run();
    } else if (inline.kind === "embed") {
      if (!parseEmbed(v)) {
        setInline({
          ...inline,
          error: "Only YouTube and Vimeo links are supported.",
        });
        return;
      }
      editor.chain().focus().setEmbed({ url: v }).run();
    } else {
      editor.chain().focus().setFootnote({ text: v }).run();
    }
    setInline(null);
  }

  const btn = (
    on: boolean,
    onClick: () => void,
    label: string,
    Icon: typeof Bold,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "hover:bg-sage/10 inline-flex size-8 items-center justify-center rounded-md transition-colors",
        on ? "bg-teal/10 text-teal-dark" : "text-soft-black-light",
      )}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className="border-border bg-warm-white rounded-md border">
      <div className="border-border flex flex-wrap items-center gap-0.5 border-b p-1.5">
        {btn(
          active.bold,
          () => editor.chain().focus().toggleBold().run(),
          "Bold",
          Bold,
        )}
        {btn(
          active.italic,
          () => editor.chain().focus().toggleItalic().run(),
          "Italic",
          Italic,
        )}
        {btn(
          active.strike,
          () => editor.chain().focus().toggleStrike().run(),
          "Strikethrough",
          Strikethrough,
        )}
        {btn(
          active.code,
          () => editor.chain().focus().toggleCode().run(),
          "Inline code",
          Code,
        )}
        {btn(
          active.codeBlock,
          () => editor.chain().focus().toggleCodeBlock().run(),
          "Code block",
          SquareCode,
        )}
        {active.codeBlock && (
          <select
            aria-label="Code block language"
            value={active.codeLang}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", {
                  language: e.target.value || null,
                })
                .run()
            }
            className="border-border bg-warm-white text-soft-black-light h-8 rounded-md border px-1.5 text-xs"
          >
            <option value="">Auto</option>
            {CODE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <span className="bg-border mx-1 h-5 w-px" />
        {btn(
          active.h2,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          "Heading 2",
          Heading2,
        )}
        {btn(
          active.h3,
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          "Heading 3",
          Heading3,
        )}
        {btn(
          active.bullet,
          () => editor.chain().focus().toggleBulletList().run(),
          "Bullet list",
          List,
        )}
        {btn(
          active.ordered,
          () => editor.chain().focus().toggleOrderedList().run(),
          "Numbered list",
          ListOrdered,
        )}
        {btn(
          active.quote,
          () => editor.chain().focus().toggleBlockquote().run(),
          "Quote",
          Quote,
        )}
        <span className="bg-border mx-1 h-5 w-px" />
        {btn(active.link || inline?.kind === "link", setLink, "Link", LinkIcon)}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Insert image"
          disabled={uploading}
          className="hover:bg-sage/10 text-soft-black-light inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickImage}
        />
        {uploadPhase === "slow" && (
          <span
            role="status"
            aria-live="polite"
            className="text-soft-black-light text-xs"
          >
            Still uploading...
          </span>
        )}
        {uploadStalled && (
          <span role="alert" className="text-error text-xs">
            That upload is still running. Refresh to check whether it landed.
          </span>
        )}
        {btn(inline?.kind === "embed", insertEmbed, "Embed a video", Video)}
        {btn(
          inline?.kind === "footnote",
          insertFootnote,
          "Add a footnote",
          Superscript,
        )}
      </div>

      {inline && (
        <div className="border-border flex flex-wrap items-center gap-2 border-b p-1.5">
          <input
            autoFocus
            type={inline.kind === "footnote" ? "text" : "url"}
            value={inline.value}
            onChange={(e) =>
              setInline({ ...inline, value: e.target.value, error: null })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitInline();
              } else if (e.key === "Escape") {
                setInline(null);
              }
            }}
            placeholder={
              inline.kind === "link"
                ? "https://example.com"
                : inline.kind === "embed"
                  ? "Paste a YouTube or Vimeo URL"
                  : "Footnote text"
            }
            className="border-border bg-warm-white text-soft-black h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
          />
          <button
            type="button"
            onClick={submitInline}
            className="bg-teal hover:bg-teal-dark rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setInline(null)}
            className="text-soft-black-light hover:text-foreground px-1 text-sm"
          >
            Cancel
          </button>
          {inline.error && (
            <span className="text-error w-full text-xs">{inline.error}</span>
          )}
        </div>
      )}

      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
