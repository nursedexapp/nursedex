import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { common, createLowlight } from "lowlight";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";

const lowlight = createLowlight(common);

/**
 * A syntax-highlighted code block. lowlight (highlight.js) tokenizes the
 * code to a HAST tree, which hast-util-to-jsx-runtime turns into React
 * elements, so there is no HTML string and no dangerouslySetInnerHTML. If
 * the post supplied a known language we use it; otherwise we auto-detect.
 * Token colors come from the `.hljs-*` theme in globals.css.
 */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const tree =
    language && lowlight.registered(language)
      ? lowlight.highlight(language, code)
      : lowlight.highlightAuto(code);
  const highlighted = toJsxRuntime(tree, { Fragment, jsx, jsxs });

  return (
    <pre className="not-prose my-6 overflow-x-auto rounded-lg bg-[#0d1117] p-4 text-sm leading-relaxed">
      <code className="hljs">{highlighted}</code>
    </pre>
  );
}
