"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import type { CropArea } from "@/lib/profile/crop";
import { cardAvatarFrame } from "@/lib/profile/card-avatar-frame";
import { DEFAULT_FOCAL } from "@/lib/profile/focal-point";

interface PhotoCropModalProps {
  imageSrc: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (area: CropArea) => void;
}

export function PhotoCropModal({
  imageSrc,
  busy,
  onCancel,
  onConfirm,
}: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);

  // What the directory card will take out of the 16:10 crop, at the focal
  // point every new photo starts on.
  const avatarFrame = cardAvatarFrame(16 / 10, DEFAULT_FOCAL);

  const onCropComplete = useCallback(
    (_area: CropArea, areaPixels: CropArea) => setArea(areaPixels),
    [],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogTitle className="font-heading text-lg font-semibold">
          Frame your photo
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Drag to reposition and use the slider to zoom. Keep your face inside
          the circle: that circle is what families see on the Find a Nurse
          cards. The rest of the frame shows on your profile page.
        </DialogDescription>

        {/* The 16:10 frame is what gets stored and what the profile page
            shows. The circle drawn over it is what the directory card takes
            out of that: a square, object-cover avatar, so it sees the full
            height of a 16:10 photo and 62.5% of its width. Its size and
            position come from the same helper the card's own geometry is
            described by, rather than a number restated here (#929).

            It is an overlay rather than the crop shape itself, deliberately.
            Cropping to the circle would throw away everything outside it, and
            the profile page uses the wide frame. */}
        <div className="bg-soft-black relative mt-2 aspect-[16/10] w-full overflow-hidden rounded-lg">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={16 / 10}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
          <div
            aria-hidden="true"
            data-testid="card-avatar-overlay"
            className="pointer-events-none absolute rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{
              left: `${avatarFrame.leftFraction * 100}%`,
              top: `${avatarFrame.topFraction * 100}%`,
              width: `${avatarFrame.widthFraction * 100}%`,
              height: `${avatarFrame.heightFraction * 100}%`,
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-soft-black-light text-xs">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="accent-teal flex-1"
            aria-label="Zoom"
          />
        </div>

        {/* This is PhotoUpload's upload button: PhotoUpload owns the request and
            passes its progress down as `busy`. A stalled upload is safe to fire
            again (each attempt asks for a fresh signed URL and writes a fresh
            object), so it retries rather than waits (#443 phase 2).

            Who owns the message: PhotoUpload's toast owns "the upload failed",
            this button's stall alert owns "the upload never answered". `busy`
            goes false the moment there is a real answer, so only one shows. */}
        <div className="mt-4 flex items-end justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <PendingButton
            pending={!!busy}
            mode="retry"
            idleLabel="Use photo"
            workingLabel="Uploading..."
            slowLabel="Still uploading..."
            onClick={() => area && onConfirm(area)}
            onRetry={() => area && onConfirm(area)}
            disabled={!area}
            className="bg-teal hover:bg-teal-dark text-white"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
