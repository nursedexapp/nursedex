/**
 * Where a nurse's face is in her photo, as two percentages (#768).
 *
 * The directory card crops her photo to a small circle, and a circle taken
 * from a fixed point cuts heads off whenever the subject is not where the
 * crop expects them. Percentages rather than a re-encoded image, so the
 * original is kept and the same point can drive any future crop shape.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * The upper third, which is where faces sit in most photos. It is also
 * exactly what the card used before nurses could set their own, so a photo
 * nobody has adjusted is framed precisely as it was.
 */
export const DEFAULT_FOCAL: FocalPoint = { x: 50, y: 25 };

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * The focal point a click or drag at this screen position means.
 *
 * Clamped, because a drag can leave the image entirely and a value past the
 * edges would crop to nothing. A photo reporting no size (one that has not
 * laid out yet) gives the default rather than dividing by zero, which would
 * store NaN: the database rejects it and the card cannot use it.
 */
export function focalFromPoint(
  box: Box,
  clientX: number,
  clientY: number,
): FocalPoint {
  if (box.width <= 0 || box.height <= 0) return DEFAULT_FOCAL;
  return {
    x: clamp(((clientX - box.left) / box.width) * 100),
    y: clamp(((clientY - box.top) / box.height) * 100),
  };
}

/** Move the point, for the arrow keys. Stops at the edges. */
export function nudgeFocal(
  focal: FocalPoint,
  dx: number,
  dy: number,
): FocalPoint {
  return { x: clamp(focal.x + dx), y: clamp(focal.y + dy) };
}
