"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { PHOTO_UPLOAD, TIER_LIMITS } from "@/lib/constants";
import { getCroppedBlob, type CropArea } from "@/lib/profile/crop";
import {
  requestPhotoUploadUrl,
  confirmPhotoUpload,
  deletePhoto,
} from "@/lib/profile/actions";
import { PhotoCropModal } from "./PhotoCropModal";
import { Button } from "@/components/ui/button";
import { usePendingPhase } from "@/components/ui/pending-button";
import { useLatestAttempt } from "@/components/ui/use-latest-attempt";
import type { NurseTier } from "@/types/enums";
import { cn } from "@/lib/utils";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface PhotoUploadProps {
  photos: string[];
  photoUrls: (string | null)[];
  tier: NurseTier;
  onChange: (photos: string[]) => void;
  /**
   * Reports the URL a freshly uploaded photo can be shown at, which this
   * component already keeps for its own preview. The parent needs it too: the
   * server-rendered URL list only covers photos that existed at page load, so
   * without this a control that renders a photo cannot show one the nurse has
   * just added until the page is reloaded (#768).
   */
  onPhotoResolved?: (path: string, url: string) => void;
}

export function PhotoUpload({
  photos,
  photoUrls,
  tier,
  onChange,
  onPhotoResolved,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  // Signed URLs for photos uploaded during this session, keyed by path.
  // The photoUrls prop is server-rendered and only includes URLs for
  // photos that existed at page load, so a freshly-uploaded photo would
  // otherwise show the placeholder icon until the next full reload.
  const [sessionUrls, setSessionUrls] = useState<Record<string, string>>({});
  // The selected photo waiting to be cropped before upload.
  const [cropState, setCropState] = useState<{
    file: File;
    src: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const removeAlertRef = useRef<HTMLDivElement>(null);
  const maxPhotos = TIER_LIMITS[tier].maxPhotos;
  const canUpload = photos.length < maxPhotos;

  const upload = useLatestAttempt();
  const remove = useLatestAttempt();

  // The remove control is a 14px X in the corner of a thumbnail, so it cannot
  // carry PendingButton's chrome. It borrows the same clock instead and renders
  // its own: a spinner on the X, then one retry alert above the grid (#443).
  const { phase: removePhase, restart: restartRemove } = usePendingPhase({
    pending: removingIndex !== null,
  });
  const removeStalled = removePhase === "stalled";

  useEffect(() => {
    // Focus the alert, the same as PendingButton does. A keyboard user lost
    // focus to <body> when the X was disabled; without this the retry is
    // announced to nobody.
    if (removeStalled)
      requestAnimationFrame(() => removeAlertRef.current?.focus());
  }, [removeStalled]);

  // Validate the chosen file, then open the cropper. Upload happens on
  // crop confirm so nurses frame exactly what shows on the search card.
  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !canUpload) return;

      const file = files[0];

      if (
        !PHOTO_UPLOAD.ALLOWED_TYPES.includes(
          file.type as (typeof PHOTO_UPLOAD.ALLOWED_TYPES)[number],
        )
      ) {
        toast.error("Please upload a JPG, PNG, or WebP image");
        return;
      }
      if (file.size > PHOTO_UPLOAD.MAX_SIZE_BYTES * 2) {
        toast.error("Image is too large. Maximum size is 5MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () =>
        setCropState({ file, src: reader.result as string });
      reader.onerror = () =>
        toast.error("Could not read that image. Please try again.");
      reader.readAsDataURL(file);

      if (inputRef.current) inputRef.current.value = "";
    },
    [canUpload],
  );

  const handleCropConfirm = useCallback(
    async (area: CropArea) => {
      if (!cropState) return;
      const { file, src } = cropState;
      const attempt = upload.begin();
      setUploading(true);

      try {
        // Crop to the card's 16:10 (also caps dimensions for upload).
        const cropped = await getCroppedBlob(src, area, file.type);

        const urlResult = await requestPhotoUploadUrl(file.name);
        if ("error" in urlResult) {
          if (upload.isLatest(attempt)) toast.error(urlResult.error);
          return;
        }

        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: cropped,
        });
        if (!uploadResponse.ok) {
          if (upload.isLatest(attempt))
            toast.error("Upload failed. Please try again.");
          return;
        }

        const validation = await confirmPhotoUpload(urlResult.path);
        if (!validation.valid) {
          if (upload.isLatest(attempt))
            toast.error(validation.error || "Invalid image file");
          return;
        }

        // A retry superseded this attempt. Landing now would add the same photo
        // to the form twice, one path per attempt.
        if (!upload.isLatest(attempt)) return;

        if (validation.signedUrl) {
          setSessionUrls((prev) => ({
            ...prev,
            [urlResult.path]: validation.signedUrl!,
          }));
          onPhotoResolved?.(urlResult.path, validation.signedUrl);
        }

        onChange([...photos, urlResult.path]);
        captureClientEvent(ANALYTICS_EVENTS.PHOTO_UPLOADED, {
          photo_count: photos.length + 1,
        });
        toast.success("Photo uploaded");
        setCropState(null);
      } catch (err) {
        // The nurse gets a plain message; the cause still has to go somewhere.
        // Swallowing it whole left "Something went wrong" as the only evidence
        // that a photo upload had failed, which is no evidence at all.
        console.error("[photo] upload failed", err);
        if (upload.isLatest(attempt))
          toast.error("Something went wrong. Please try again.");
      } finally {
        if (upload.isLatest(attempt)) setUploading(false);
      }
    },
    [cropState, photos, onChange, onPhotoResolved, upload],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const path = photos[index];
      const attempt = remove.begin();
      setRemovingIndex(index);

      try {
        await deletePhoto(path);
        if (!remove.isLatest(attempt)) return;
        onChange(photos.filter((_, i) => i !== index));
        toast.success("Photo removed");
      } catch {
        // A superseded attempt stays silent: the retry has already reported.
        if (remove.isLatest(attempt))
          toast.error("Could not remove photo. Please try again.");
      } finally {
        if (remove.isLatest(attempt)) setRemovingIndex(null);
      }
    },
    [photos, onChange, remove],
  );

  const handleRetryRemove = useCallback(() => {
    if (removingIndex === null) return;
    restartRemove();
    void handleRemove(removingIndex);
  }, [removingIndex, restartRemove, handleRemove]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  return (
    <div className="space-y-3">
      {/* Removing a photo: still-alive, then failed. The toast still owns a
          delete that comes back and fails; this owns one that never comes back
          at all. */}
      {removePhase === "slow" && (
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          Removing photo...
        </div>
      )}
      {removeStalled && (
        <div
          ref={removeAlertRef}
          tabIndex={-1}
          role="alert"
          className="bg-error/10 text-error flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 text-sm outline-none"
        >
          <span>Removing that photo is taking longer than usual.</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleRetryRemove}
            className="text-error h-auto px-0 underline"
          >
            Try again
          </Button>
        </div>
      )}

      {/* Photo previews */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((path, i) => {
            const url = sessionUrls[path] ?? photoUrls[i];
            return (
              <div
                key={path}
                className="border-input relative size-24 overflow-hidden rounded-lg border"
              >
                {url ? (
                  <Image
                    src={url}
                    alt={`Photo ${i + 1}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="bg-sage/10 flex size-full items-center justify-center">
                    <ImageIcon className="text-muted-foreground size-8" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  // Stays disabled once stalled too: the retry lives in the
                  // alert above, so there is only ever one control to press.
                  disabled={removingIndex === i}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80 disabled:opacity-70"
                >
                  {removingIndex === i ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  <span className="sr-only">Remove photo</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload area */}
      {canUpload && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
            uploading
              ? "border-teal/40 bg-teal/5"
              : "border-sage/40 hover:border-teal/40 hover:bg-sage/5",
          )}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <Upload
            className={cn(
              "size-8",
              uploading ? "text-teal animate-pulse" : "text-muted-foreground",
            )}
          />
          <div>
            <p className="text-sm font-medium">
              Drop a photo here or click to browse
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              JPG, PNG, or WebP. Max 5MB. ({photos.length}/{maxPhotos})
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={uploading || !canUpload}
      />

      {cropState && (
        <PhotoCropModal
          imageSrc={cropState.src}
          busy={uploading}
          onCancel={() => {
            if (!uploading) setCropState(null);
          }}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
