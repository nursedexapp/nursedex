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

describe("Footer navigation", () => {
  const html = renderToStaticMarkup(<Footer year={2026} />);

  // Before #1042 the footer carried only Blog and the legal links, which left
  // /pricing, /about, /faq and /contact with no route in from any public page.
  // /pricing is the one that cost money: it sells Featured at $29/mo to nurses,
  // and could only be reached from inside a signed in nurse's dashboard.
  it.each([
    ["/nurses", "the directory"],
    ["/pricing", "the page that sells Featured"],
    ["/how-it-works", "how it works"],
    ["/blog", "the blog"],
    ["/about", "about"],
    ["/faq", "the FAQ"],
    ["/contact", "contact"],
  ])("links to %s (%s) on every public page", (href) => {
    expect(html).toContain(`href="${href}"`);
  });

  it("keeps the legal links it already carried", () => {
    for (const href of ["/privacy", "/terms", "/attributions"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
