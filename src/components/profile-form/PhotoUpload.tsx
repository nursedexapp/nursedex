"use client";

import { useState, useRef, useCallback } from "react";
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
import type { NurseTier } from "@/types/enums";
import { cn } from "@/lib/utils";
import { Upload, X, ImageIcon } from "lucide-react";

interface PhotoUploadProps {
  photos: string[];
  photoUrls: (string | null)[];
  tier: NurseTier;
  onChange: (photos: string[]) => void;
}

export function PhotoUpload({
  photos,
  photoUrls,
  tier,
  onChange,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  // Signed URLs for photos uploaded during this session, keyed by path.
  // The photoUrls prop is server-rendered and only includes URLs for
  // photos that existed at page load, so a freshly-uploaded photo would
  // otherwise show the placeholder icon until the next full reload.
  const [sessionUrls, setSessionUrls] = useState<Record<string, string>>({});
  // The selected photo waiting to be cropped before upload.
  const [cropState, setCropState] = useState<{ file: File; src: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const maxPhotos = TIER_LIMITS[tier].maxPhotos;
  const canUpload = photos.length < maxPhotos;

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
      setUploading(true);

      try {
        // Crop to the card's 16:10 (also caps dimensions for upload).
        const cropped = await getCroppedBlob(src, area, file.type);

        const urlResult = await requestPhotoUploadUrl(file.name);
        if ("error" in urlResult) {
          toast.error(urlResult.error);
          return;
        }

        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: cropped,
        });
        if (!uploadResponse.ok) {
          toast.error("Upload failed. Please try again.");
          return;
        }

        const validation = await confirmPhotoUpload(urlResult.path);
        if (!validation.valid) {
          toast.error(validation.error || "Invalid image file");
          return;
        }

        if (validation.signedUrl) {
          setSessionUrls((prev) => ({
            ...prev,
            [urlResult.path]: validation.signedUrl!,
          }));
        }

        onChange([...photos, urlResult.path]);
        toast.success("Photo uploaded");
        setCropState(null);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [cropState, photos, onChange],
  );

  const handleRemove = async (index: number) => {
    const path = photos[index];
    setRemovingIndex(index);

    try {
      await deletePhoto(path);
      onChange(photos.filter((_, i) => i !== index));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove photo. Please try again.");
    } finally {
      setRemovingIndex(null);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  return (
    <div className="space-y-3">
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
                  disabled={removingIndex === i}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80"
                >
                  <X className="size-3.5" />
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
