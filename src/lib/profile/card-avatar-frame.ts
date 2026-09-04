import type { FocalPoint } from "./focal-point";

/**
 * What the directory card's round avatar actually takes out of a nurse's
 * stored photo (#929).
 *
 * The card is a square 64px container with `object-cover`, so the browser
 * scales the photo until it covers that square and then shows the middle band
 * of whatever overflows. `objectPosition` slides that band, but only along the
 * axis that actually overflows. This puts that arithmetic in one place, so the
 * crop dialog can draw the same shape the card will take rather than a second
 * guess at it.
 *
 * Measured against production on 2026-09-03, over 40 profiles with a photo:
 * 26 stored photos are 16:10 (what the crop dialog produces) and 14 are exactly
 * square. Every one of the 40 still sits on the default focal point of 50, 25,
 * so nobody has moved it since #768 shipped.
 */
export interface CardAvatarFrame {
  /** Fraction of the photo's width the avatar shows, 0 to 1. */
  widthFraction: number;
  /** Fraction of the photo's height the avatar shows, 0 to 1. */
  heightFraction: number;
  /** Where that window starts, as a fraction of the photo's width. */
  leftFraction: number;
  /** Where that window starts, as a fraction of the photo's height. */
  topFraction: number;
  /** Whether the focal point's x can move the window at all. */
  horizontalSlack: boolean;
  /** Whether the focal point's y can move the window at all. */
  verticalSlack: boolean;
}

/**
 * @param aspect the stored photo's width divided by its height
 * @param focal where the nurse says her face is, as percentages
 */
export function cardAvatarFrame(
  aspect: number,
  focal: FocalPoint,
): CardAvatarFrame {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error(
      `cardAvatarFrame: aspect must be a positive finite number, got ${aspect}`,
    );
  }

  // The container is square, so a photo wider than tall overflows sideways and
  // a photo taller than wide overflows vertically. Exactly one of the two can
  // overflow, and a square photo overflows neither.
  const widthFraction = aspect >= 1 ? 1 / aspect : 1;
  const heightFraction = aspect >= 1 ? 1 : aspect;

  const horizontalRoom = 1 - widthFraction;
  const verticalRoom = 1 - heightFraction;

  return {
    widthFraction,
    heightFraction,
    leftFraction: horizontalRoom * clampPercent(focal.x),
    topFraction: verticalRoom * clampPercent(focal.y),
    horizontalSlack: horizontalRoom > 0,
    verticalSlack: verticalRoom > 0,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(100, Math.max(0, value)) / 100;
}
