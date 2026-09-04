// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "./Footer";

describe("Footer copyright year", () => {
  it("renders the year it is handed, not one it reads off the clock", () => {
    const html = renderToStaticMarkup(<Footer year={1999} />);
    expect(html).toContain("1999 NurseDex LLC");
    expect(html).not.toContain(String(new Date().getUTCFullYear()));
  });
});
