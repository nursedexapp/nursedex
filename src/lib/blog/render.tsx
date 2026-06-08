import { Fragment, type ReactNode } from "react";
import type { TiptapDoc, TiptapNode } from "@/types/database";
import { headingId, nodeText } from "./toc";
import { CodeBlock } from "@/components/blog/CodeBlock";

/**
 * Render a stored Tiptap (ProseMirror) document to React elements.
 *
 * Security model: the post body is authored by admins, but rather than
 * trust it we never turn it into an HTML string and never touch
 * dangerouslySetInnerHTML. We walk the JSON and emit React elements from
 * an explicit allowlist of node and mark types. Anything we do not
 * recognise is dropped. Link hrefs are scheme checked (http, https,
 * mailto only) and rendered with rel="noopener nofollow"; image sources
 * must live on an allowlisted host. This closes the injection surface by
 * construction, so even a compromised admin session cannot inject
 * executable markup.
 */

const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Return a safe href, or null if the scheme is not allowlisted. Anything
 * that does not parse (or uses javascript:, data:, etc.) is rejected.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  try {
    // Resolve against a base so protocol-relative and relative hrefs
    // parse, then check the resulting protocol.
    const url = new URL(trimmed, "https://nursedex.com");
    return ALLOWED_LINK_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Hosts that blog images may be served from (the Supabase storage host). */
export function allowedImageHosts(): string[] {
  const hosts: string[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.push(new URL(supabaseUrl).host);
    } catch {
      // ignore a malformed env value
    }
  }
  return hosts;
}

/** True when an image src is an absolute URL on an allowlisted host. */
export function isAllowedImageSrc(
  src: unknown,
  hosts: string[] = allowedImageHosts(),
): boolean {
  if (typeof src !== "string") return false;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return hosts.includes(url.host);
  } catch {
    return false;
  }
}

function applyMarks(text: ReactNode, node: TiptapNode, key: string): ReactNode {
  let el = text;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        el = <strong key={`${key}-b`}>{el}</strong>;
        break;
      case "italic":
        el = <em key={`${key}-i`}>{el}</em>;
        break;
      case "strike":
        el = <s key={`${key}-s`}>{el}</s>;
        break;
      case "code":
        el = <code key={`${key}-c`}>{el}</code>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        // A rejected scheme keeps the text but drops the anchor.
        if (href) {
          el = (
            <a
              key={`${key}-a`}
              href={href}
              target="_blank"
              rel="noopener nofollow"
            >
              {el}
            </a>
          );
        }
        break;
      }
      // Unknown marks are ignored (text is still rendered).
    }
  }
  return el;
}

function renderNode(
  node: TiptapNode,
  key: string,
  seen: Map<string, number>,
): ReactNode {
  switch (node.type) {
    case "text":
      return (
        <Fragment key={key}>{applyMarks(node.text ?? "", node, key)}</Fragment>
      );
    case "paragraph":
      return <p key={key}>{renderChildren(node, key, seen)}</p>;
    case "heading": {
      const raw = Number(node.attrs?.level) || 2;
      const level = Math.min(Math.max(raw, 2), 6);
      const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      // The id matches the table of contents: same generator, same order.
      const id = headingId(nodeText(node), seen);
      return (
        <Tag key={key} id={id} className="scroll-mt-24">
          {renderChildren(node, key, seen)}
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, key, seen)}</ul>;
    case "orderedList":
      return <ol key={key}>{renderChildren(node, key, seen)}</ol>;
    case "listItem":
      return <li key={key}>{renderChildren(node, key, seen)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, key, seen)}</blockquote>;
    case "codeBlock": {
      // Preserve the raw code (newlines included) for the highlighter,
      // rather than the whitespace-collapsing renderChildren path.
      const code = (node.content ?? [])
        .map((c) => (c.type === "hardBreak" ? "\n" : (c.text ?? "")))
        .join("");
      const language =
        typeof node.attrs?.language === "string"
          ? node.attrs.language
          : undefined;
      return <CodeBlock key={key} code={code} language={language} />;
    }
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = node.attrs?.src;
      if (!isAllowedImageSrc(src)) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      // Body images are arbitrary external URLs validated against an
      // allowlist; next/image is not a fit for inline editorial content.
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src as string} alt={alt} loading="lazy" />;
    }
    default:
      // Unknown node types are dropped entirely.
      return null;
  }
}

function renderChildren(
  node: TiptapNode,
  key: string,
  seen: Map<string, number>,
): ReactNode {
  return (node.content ?? []).map((child, i) =>
    renderNode(child, `${key}-${i}`, seen),
  );
}

export function PostContent({ doc }: { doc: TiptapDoc | null | undefined }) {
  if (!doc || doc.type !== "doc" || !doc.content) return null;
  // Shared across the render pass so heading ids de-dupe in document order,
  // matching extractHeadings used by the table of contents.
  const seen = new Map<string, number>();
  return <>{doc.content.map((node, i) => renderNode(node, `n-${i}`, seen))}</>;
}
