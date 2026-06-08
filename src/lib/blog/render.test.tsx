// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TiptapDoc, TiptapNode } from "@/types/database";

// render -> toc -> slug -> service-role imports "server-only"; stub it.
vi.mock("server-only", () => ({}));

import {
  PostContent,
  safeHref,
  isAllowedImageSrc,
} from "./render";
import { extractHeadings } from "./toc";

const IMAGE_HOST = "abcdefgh.supabase.co";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${IMAGE_HOST}`;
});

function html(doc: TiptapDoc): string {
  return renderToStaticMarkup(<PostContent doc={doc} />);
}

function doc(...content: TiptapNode[]): TiptapDoc {
  return { type: "doc", content };
}

describe("safeHref", () => {
  it("allows http, https, and mailto", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com/");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("rejects javascript:, data:, and vbscript: schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html;base64,PHN2Zz4=")).toBeNull();
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe("isAllowedImageSrc", () => {
  it("allows the configured host", () => {
    expect(isAllowedImageSrc(`https://${IMAGE_HOST}/x.png`)).toBe(true);
  });

  it("rejects other hosts and non-http schemes", () => {
    expect(isAllowedImageSrc("https://evil.com/x.png")).toBe(false);
    expect(isAllowedImageSrc("data:image/png;base64,AAAA")).toBe(false);
    expect(isAllowedImageSrc("not a url")).toBe(false);
  });
});

describe("PostContent renderer", () => {
  it("maps allowed nodes and marks to expected elements", () => {
    const out = html(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: "code", marks: [{ type: "code" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
          ],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "q" }] }] },
      ),
    );
    expect(out).toContain(">Title</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<ul><li><p>one</p></li></ul>");
    expect(out).toContain("<blockquote><p>q</p></blockquote>");
  });

  it("gives headings ids that match the table of contents", () => {
    const d = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
    );
    const out = html(d);
    expect(out).toContain('id="intro"');
    expect(out).toContain('id="intro-1"');
    expect(extractHeadings(d).map((h) => h.id)).toEqual(["intro", "intro-1"]);
  });

  it("syntax-highlights code blocks", () => {
    const out = html(
      doc({
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: "const x = 1;" }],
      }),
    );
    expect(out).toContain('class="hljs"');
    expect(out).toContain("hljs-keyword");
  });

  it("clamps heading levels into h2..h6 so post body never emits an h1", () => {
    const out = html(
      doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }),
    );
    expect(out).toContain(">x</h2>");
    expect(out).not.toContain("<h1");
  });

  it("drops unknown node and mark types", () => {
    const out = html(
      doc(
        { type: "evilNode", content: [{ type: "text", text: "nope" }] },
        { type: "paragraph", content: [{ type: "text", text: "ok", marks: [{ type: "evilMark" }] }] },
      ),
    );
    expect(out).not.toContain("nope");
    expect(out).toContain("<p>ok</p>");
  });

  it("renders a safe link with rel=noopener nofollow and target=_blank", () => {
    const out = html(
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ],
      }),
    );
    expect(out).toContain('rel="noopener nofollow"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("https://example.com");
  });

  it("never emits an anchor for a javascript: link, keeping the text", () => {
    const out = html(
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
        ],
      }),
    );
    expect(out).not.toContain("<a");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it("renders a known embed as a normalized provider iframe", () => {
    const out = html(
      doc({
        type: "embed",
        attrs: { url: "https://youtu.be/dQw4w9WgXcQ" },
      }),
    );
    expect(out).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(out).toContain("<iframe");
  });

  it("drops an embed from an unknown provider", () => {
    const out = html(
      doc({ type: "embed", attrs: { url: "https://evil.com/embed/x" } }),
    );
    expect(out).not.toContain("evil.com");
    expect(out).not.toContain("<iframe");
  });

  it("renders an image on the allowlisted host but drops an off-host image", () => {
    const good = html(doc({ type: "image", attrs: { src: `https://${IMAGE_HOST}/c.png`, alt: "c" } }));
    expect(good).toContain(`src="https://${IMAGE_HOST}/c.png"`);

    const bad = html(doc({ type: "image", attrs: { src: "https://evil.com/x.png", alt: "x" } }));
    expect(bad).not.toContain("evil.com");
    expect(bad).not.toContain("<img");
  });

  it("returns nothing for an empty or malformed document", () => {
    expect(html({ type: "doc" } as TiptapDoc)).toBe("");
    expect(renderToStaticMarkup(<PostContent doc={null} />)).toBe("");
  });
});
