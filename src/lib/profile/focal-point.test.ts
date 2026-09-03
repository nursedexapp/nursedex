// @vitest-environment node
import { describe, it, expect } from "vitest";
import { focalFromPoint, nudgeFocal, DEFAULT_FOCAL } from "./focal-point";

/**
 * Where a nurse's face is in her photo, as two percentages (#768). The card
 * crops her photo to a small circle, and a circle taken from a fixed point
 * cuts heads off whenever the subject is not where the crop expects them.
 *
 * Percentages rather than a re-encoded image, so the original is kept and the
 * same point can drive any future crop shape.
 */
const box = { left: 100, top: 50, width: 200, height: 100 };

describe("focalFromPoint", () => {
  it("puts the middle of the photo at the middle", () => {
    expect(focalFromPoint(box, 200, 100)).toEqual({ x: 50, y: 50 });
  });

  it("reads a point near the top left corner", () => {
    expect(focalFromPoint(box, 100, 50)).toEqual({ x: 0, y: 0 });
  });

  it("reads a point at the far corner", () => {
    expect(focalFromPoint(box, 300, 150)).toEqual({ x: 100, y: 100 });
  });

  it("keeps a point dragged outside the photo on the photo", () => {
    // A drag can leave the image entirely. Letting the value run past the
    // edges would store a focal point that crops to nothing.
    expect(focalFromPoint(box, -500, -500)).toEqual({ x: 0, y: 0 });
    expect(focalFromPoint(box, 5000, 5000)).toEqual({ x: 100, y: 100 });
  });

  it("refuses to divide by a photo with no size", () => {
    // An image that has not laid out yet reports zero width, and dividing by
    // it would store NaN, which the database rejects and the card cannot use.
    expect(focalFromPoint({ ...box, width: 0, height: 0 }, 120, 60)).toEqual(
      DEFAULT_FOCAL,
    );
  });
});

describe("nudgeFocal", () => {
  it("moves the point by a step", () => {
    expect(nudgeFocal({ x: 50, y: 50 }, 5, 0)).toEqual({ x: 55, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, 0, -5)).toEqual({ x: 50, y: 45 });
  });

  it("stops at the edges rather than running past them", () => {
    expect(nudgeFocal({ x: 98, y: 2 }, 5, -5)).toEqual({ x: 100, y: 0 });
  });
});
