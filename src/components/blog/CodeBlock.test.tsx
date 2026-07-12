// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  it("highlights a known language into hljs token spans", () => {
    const out = renderToStaticMarkup(
      <CodeBlock code={"const x = 1;"} language="javascript" />,
    );
    expect(out).toContain('class="hljs"');
    expect(out).toContain("hljs-keyword"); // 'const'
    expect(out).toContain("const");
    expect(out).toContain("</pre>");
  });

  it("auto-detects the language when none is given", () => {
    const out = renderToStaticMarkup(
      <CodeBlock code={"def foo():\n    return 1"} />,
    );
    expect(out).toContain('class="hljs"');
    expect(out).toContain("foo");
  });

  it("escapes code text (no raw markup injection)", () => {
    const out = renderToStaticMarkup(
      <CodeBlock code={"<script>alert(1)</script>"} language="html" />,
    );
    // The code is rendered as escaped text, never as a live <script> tag.
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;");
    expect(out).toContain("alert(1)");
  });
});
