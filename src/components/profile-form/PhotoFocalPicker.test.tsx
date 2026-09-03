// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { PhotoFocalPicker } from "./PhotoFocalPicker";

/**
 * The card crops a nurse's photo to a small circle, and a circle taken from a
 * fixed point cuts heads off when the subject is not where the crop expects
 * them (#768). This lets her say where her face is.
 *
 * It has to be usable without a mouse: a drag-only control would leave a
 * nurse who cannot drag with no way to fix a photo that is cutting her head
 * off, and no way to know that is what is happening.
 */
afterEach(cleanup);

function setup(x = 50, y = 25) {
  const onChange = vi.fn();
  render(
    <PhotoFocalPicker
      src="https://example.test/photo.jpg"
      focal={{ x, y }}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("PhotoFocalPicker", () => {
  it("shows a preview framed the way the card will frame it", () => {
    setup(30, 60);
    const preview = screen.getByTestId("focal-preview");
    expect(preview).toHaveStyle({ objectPosition: "30% 60%" });
  });

  it("says where the point currently is, in words", () => {
    setup(30, 60);
    expect(screen.getByText(/30% across/i)).toBeInTheDocument();
    expect(screen.getByText(/60% down/i)).toBeInTheDocument();
  });

  it("moves the point when the photo is clicked", () => {
    const { onChange } = setup();
    const surface = screen.getByRole("button", { name: /where your face is/i });
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

    fireEvent.click(surface, { clientX: 100, clientY: 75 });

    expect(onChange).toHaveBeenCalledWith({ x: 50, y: 75 });
  });

  it("moves the point with the arrow keys", () => {
    const { onChange } = setup(50, 25);
    const surface = screen.getByRole("button", { name: /where your face is/i });

    fireEvent.keyDown(surface, { key: "ArrowDown" });

    expect(onChange).toHaveBeenCalledWith({ x: 50, y: 30 });
  });

  it("can be reached by keyboard at all", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /where your face is/i }),
    ).toHaveAttribute("tabindex", "0");
  });
});
