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
          Drag to reposition and use the slider to zoom. This is exactly how
          your photo appears on the Find a Nurse cards.
        </DialogDescription>

        {/* 16:10 frame matches the search card's photo area exactly. */}
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
