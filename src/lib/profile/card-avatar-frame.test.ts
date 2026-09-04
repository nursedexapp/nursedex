import { describe, it, expect } from "vitest";
import { cardAvatarFrame } from "./card-avatar-frame";

describe("cardAvatarFrame", () => {
  // The directory card is a square (round) 64px avatar with object-cover over
  // the stored photo. object-cover scales the photo until it covers the
  // square, so the square sees a full-height band of a wide photo.
  describe("a 16:10 photo, which is what the crop dialog produces", () => {
    const frame = cardAvatarFrame(16 / 10, { x: 50, y: 25 });

    it("shows the full height of the crop", () => {
      expect(frame.heightFraction).toBeCloseTo(1, 5);
    });

    it("shows 62.5% of its width, which is where the framing is decided", () => {
      expect(frame.widthFraction).toBeCloseTo(0.625, 5);
    });

    it("centres that band when the focal point is centred", () => {
      expect(frame.leftFraction).toBeCloseTo((1 - 0.625) / 2, 5);
      expect(frame.topFraction).toBeCloseTo(0, 5);
    });

    it("moves the band across as the focal point moves across", () => {
      expect(cardAvatarFrame(16 / 10, { x: 0, y: 25 }).leftFraction).toBeCloseTo(0, 5);
      expect(cardAvatarFrame(16 / 10, { x: 100, y: 25 }).leftFraction).toBeCloseTo(0.375, 5);
    });

    // The finding behind this: with no vertical overflow there is no vertical
    // slack, so objectPosition's second value cannot move anything. Every one
    // of the 40 photos measured in production sits at the default 50,25.
    it("cannot move it up or down, because there is no vertical overflow", () => {
      for (const y of [0, 25, 50, 100]) {
        expect(cardAvatarFrame(16 / 10, { x: 50, y }).topFraction).toBeCloseTo(0, 5);
      }
      expect(cardAvatarFrame(16 / 10, { x: 50, y: 0 }).verticalSlack).toBe(false);
    });
  });

  describe("a square photo, which 14 of 40 stored photos are", () => {
    const frame = cardAvatarFrame(1, { x: 50, y: 25 });

    it("is shown whole", () => {
      expect(frame.widthFraction).toBeCloseTo(1, 5);
      expect(frame.heightFraction).toBeCloseTo(1, 5);
    });

    it("cannot be repositioned at all, in either direction", () => {
      expect(frame.horizontalSlack).toBe(false);
      expect(frame.verticalSlack).toBe(false);
      expect(cardAvatarFrame(1, { x: 0, y: 0 }).leftFraction).toBeCloseTo(0, 5);
      expect(cardAvatarFrame(1, { x: 100, y: 100 }).leftFraction).toBeCloseTo(0, 5);
    });
  });

  describe("a portrait photo, taller than it is wide", () => {
    const frame = cardAvatarFrame(0.5, { x: 50, y: 25 });

    it("shows its full width and a band of its height", () => {
      expect(frame.widthFraction).toBeCloseTo(1, 5);
      expect(frame.heightFraction).toBeCloseTo(0.5, 5);
    });

    it("moves that band up and down with the focal point", () => {
      expect(frame.topFraction).toBeCloseTo(0.125, 5);
      expect(frame.verticalSlack).toBe(true);
      expect(frame.horizontalSlack).toBe(false);
    });
  });

  it("refuses an aspect ratio that is not a positive number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => cardAvatarFrame(bad, { x: 50, y: 25 })).toThrow(/aspect/i);
    }
  });
});
