// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { installTranslationGuard } from "./translation-guard";

// What Google Translate does to a page, as recorded on NURSEDEX-SITE-19 and
// 1A (#1240): every text node is taken OUT of the DOM and a pair of <font>
// wrappers holding the translation is put where it was. PostHog autocapture
// saw exactly this shape on the visitor's taps (`font` with
// `vertical-align: inherit`). React still holds the original text node, now
// detached, so its next removeChild or insertBefore naming it throws.
function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (!text.nodeValue?.trim()) continue;
    const outer = document.createElement("font");
    outer.setAttribute("style", "vertical-align: inherit;");
    const inner = document.createElement("font");
    inner.setAttribute("style", "vertical-align: inherit;");
    inner.textContent = `es: ${text.nodeValue}`;
    outer.appendChild(inner);
    text.parentNode!.replaceChild(outer, text);
  }
}

// The shape of PendingButton (src/components/ui/pending-button.tsx): a spinner
// inserted IN FRONT OF the label when pending. On the signup page that insert
// names the label's text node as its reference, which Translate has removed.
function Button({ pending }: { pending: boolean }) {
  return (
    <button>
      {pending ? <svg data-testid="spinner" /> : null}
      {"Join NurseDex"}
    </button>
  );
}

// A text node React REMOVES on its own, the removeChild half of the crash.
function Hint({ shown }: { shown: boolean }) {
  return (
    <p>
      {"Password"}
      {shown ? " must be at least 8 characters." : null}
    </p>
  );
}

let uninstall: (() => void) | undefined;

afterEach(() => {
  cleanup();
  uninstall?.();
  uninstall = undefined;
});

describe("a translated page without the guard (the crash, reproduced)", () => {
  it("throws when React inserts in front of translated text", () => {
    const { container, rerender } = render(<Button pending={false} />);
    translate(container);
    expect(() => rerender(<Button pending />)).toThrow();
  });

  it("throws when React removes translated text", () => {
    const { container, rerender } = render(<Hint shown />);
    translate(container);
    expect(() => rerender(<Hint shown={false} />)).toThrow();
  });
});

describe("a translated page with the guard", () => {
  it("keeps working when React inserts in front of translated text, and shows the new element", () => {
    const onSkip = vi.fn();
    uninstall = installTranslationGuard(onSkip);
    const { container, rerender, getByTestId } = render(
      <Button pending={false} />,
    );
    translate(container);

    expect(() => rerender(<Button pending />)).not.toThrow();
    expect(
      container.querySelector("button")!.contains(getByTestId("spinner")),
    ).toBe(true);
    expect(container.textContent).toContain("es: Join NurseDex");
    expect(onSkip).toHaveBeenCalledWith("insertBefore");
  });

  it("keeps working when React removes translated text", () => {
    const onSkip = vi.fn();
    uninstall = installTranslationGuard(onSkip);
    const { container, rerender } = render(<Hint shown />);
    translate(container);

    expect(() => rerender(<Hint shown={false} />)).not.toThrow();
    expect(onSkip).toHaveBeenCalledWith("removeChild");
  });
});

describe("an untranslated page with the guard", () => {
  it("removes, inserts and appends exactly as the DOM does, and reports nothing", () => {
    const onSkip = vi.fn();
    uninstall = installTranslationGuard(onSkip);
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("span");
    const c = document.createElement("span");

    expect(parent.appendChild(b)).toBe(b);
    expect(parent.insertBefore(a, b)).toBe(a);
    expect(parent.insertBefore(c, null)).toBe(c);
    expect([...parent.childNodes]).toEqual([a, b, c]);
    expect(parent.removeChild(b)).toBe(b);
    expect([...parent.childNodes]).toEqual([a, c]);
    expect(onSkip).not.toHaveBeenCalled();

    const { rerender, container } = render(<Hint shown={false} />);
    rerender(<Hint shown />);
    rerender(<Hint shown={false} />);
    expect(container.textContent).toBe("Password");
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("wraps the DOM once however many times it is installed", () => {
    const before = Node.prototype.removeChild;
    const first = installTranslationGuard(vi.fn());
    const wrapped = Node.prototype.removeChild;
    const second = installTranslationGuard(vi.fn());
    expect(Node.prototype.removeChild).toBe(wrapped);
    second();
    first();
    expect(Node.prototype.removeChild).toBe(before);
  });
});
