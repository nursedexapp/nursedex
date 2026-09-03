"use client";

import {
  focalFromPoint,
  nudgeFocal,
  type FocalPoint,
} from "@/lib/profile/focal-point";

interface PhotoFocalPickerProps {
  src: string;
  focal: FocalPoint;
  onChange: (focal: FocalPoint) => void;
}

const STEP = 5;

/**
 * Lets a nurse say where her face is in her photo (#768).
 *
 * The directory card crops her photo to a small circle. Anchoring that crop
 * at the upper third gets most photos right, and cannot get all of them
 * right: a number of the real photos on the roster are group shots or off
 * centre, and the crop cuts heads off.
 *
 * Clicking the photo places the point, and the arrow keys move it. Both,
 * deliberately: a drag-only control would leave a nurse who cannot use a
 * mouse with no way to fix a photo that is cutting her head off, and the
 * spoken position is the only way she would know that is what is happening.
 */
export function PhotoFocalPicker({
  src,
  focal,
  onChange,
}: PhotoFocalPickerProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onChange(nudgeFocal(focal, move[0], move[1]));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Set where your face is in the photo"
          onKeyDown={handleKeyDown}
          onClick={(e) =>
            onChange(
              focalFromPoint(
                e.currentTarget.getBoundingClientRect(),
                e.clientX,
                e.clientY,
              ),
            )
          }
          className="border-sage/30 focus-visible:ring-teal relative w-full max-w-xs cursor-crosshair overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, already-sized upload preview, not a page image */}
          <img src={src} alt="" className="block w-full" />
          <span
            aria-hidden="true"
            className="border-warm-white bg-teal/70 absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
          />
        </div>

        <div className="shrink-0 text-center">
          <div className="bg-sage-light size-16 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img
              data-testid="focal-preview"
              src={src}
              alt=""
              className="size-full object-cover"
              style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
            />
          </div>
          <p className="text-soft-black-light mt-1 text-xs">On your card</p>
        </div>
      </div>

      <p className="text-soft-black-light text-xs">
        Click your photo, or use the arrow keys, to choose what shows in the
        circle families see. Currently {focal.x}% across and {focal.y}% down.
      </p>
    </div>
  );
}
