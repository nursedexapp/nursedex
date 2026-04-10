"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHOTO_UPLOAD, TIER_LIMITS } from "@/lib/constants";
import { resizeImage } from "@/lib/profile/resize";
import {
  requestPhotoUploadUrl,
  confirmPhotoUpload,
  deletePhoto,
} from "@/lib/profile/actions";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const maxPhotos = TIER_LIMITS[tier].maxPhotos;
  const canUpload = photos.length < maxPhotos;

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !canUpload) return;

      const file = files[0];

      // Validate type
      if (
        !PHOTO_UPLOAD.ALLOWED_TYPES.includes(
          file.type as (typeof PHOTO_UPLOAD.ALLOWED_TYPES)[number],
        )
      ) {
        toast.error("Please upload a JPG, PNG, or WebP image");
        return;
      }

      // Validate size (before resize)
      if (file.size > PHOTO_UPLOAD.MAX_SIZE_BYTES * 2) {
        toast.error("Image is too large. Maximum size is 5MB.");
        return;
      }

      setUploading(true);

      try {
        // Resize client-side
        const resized = await resizeImage(
          file,
          PHOTO_UPLOAD.MAX_DIMENSION_PX,
        );

        // Get signed upload URL
        const urlResult = await requestPhotoUploadUrl(file.name);

        if ("error" in urlResult) {
          toast.error(urlResult.error);
          return;
        }

        // Upload directly to Supabase Storage
        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: resized,
        });

        if (!uploadResponse.ok) {
          toast.error("Upload failed. Please try again.");
          return;
        }

        // Validate magic bytes server-side
        const validation = await confirmPhotoUpload(urlResult.path);

        if (!validation.valid) {
          toast.error(validation.error || "Invalid image file");
          return;
        }

        // Update photos array
        onChange([...photos, urlResult.path]);
        toast.success("Photo uploaded");
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [canUpload, photos, onChange],
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
            const url = photoUrls[i];
            return (
              <div
                key={path}
                className="relative size-24 overflow-hidden rounded-lg border border-input"
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-sage/10">
                    <ImageIcon className="size-8 text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  disabled={removingIndex === i}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80"
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
              uploading ? "animate-pulse text-teal" : "text-muted-foreground",
            )}
          />
          <div>
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Drop a photo here or click to browse"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
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
    </div>
  );
}
