"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { PhotoUpload } from "./PhotoUpload";
import { PhotoFocalPicker } from "./PhotoFocalPicker";
import type { NurseTier } from "@/types/enums";
import { TIER_LIMITS } from "@/lib/constants";
import {
  isBioFromPlaceholder,
  BIO_PLACEHOLDER_ERROR,
} from "@/lib/schemas/profile";
import { cn } from "@/lib/utils";

interface BioFieldsProps {
  values: {
    bio: string;
    photos: string[];
    photo_focal_x: number;
    photo_focal_y: number;
  };
  photoUrls: (string | null)[];
  tier: NurseTier;
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string | undefined>;
}

export function BioFields({
  values,
  photoUrls,
  tier,
  onChange,
  errors,
}: BioFieldsProps) {
  // URLs for photos uploaded during THIS visit. photoUrls is server-rendered
  // and only covers photos that existed at page load, so on the sign-up step
  // it is empty for the photo she just added, and the framing control would
  // not appear until the page was reloaded (#768).
  const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({});
  const firstPhoto = values.photos[0];
  const firstPhotoUrl =
    photoUrls[0] ?? (firstPhoto ? uploadedUrls[firstPhoto] : undefined);

  const maxBio = TIER_LIMITS[tier].bioMaxLength;
  const bioLength = values.bio.length;
  const bioPercent = bioLength / maxBio;
  // Surface the "looks like the placeholder" warning as the user types,
  // not just on submit. Only kick in once they've typed enough to
  // plausibly contain a flagged phrase, otherwise it fires on every
  // partial keystroke during normal copying.
  const looksLikePlaceholder =
    bioLength >= 30 && isBioFromPlaceholder(values.bio);

  return (
    <>
      {/* Bio */}
      <div className="space-y-2">
        <Label htmlFor="bio">Your bio</Label>
        <p className="text-muted-foreground text-xs">
          Tell families about yourself, your experience, and why you love what
          you do.
        </p>
        <Textarea
          id="bio"
          value={values.bio}
          onChange={(e) => onChange("bio", e.target.value)}
          placeholder="I have been a dedicated healthcare professional for over 10 years, specializing in elder care across New York. I treat every patient like family..."
          rows={5}
          maxLength={maxBio}
          aria-invalid={errors.bio ? true : undefined}
        />
        <p
          className={cn(
            "text-right text-xs",
            bioPercent >= 1
              ? "text-destructive"
              : bioPercent >= 0.9
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {bioLength}/{maxBio}
        </p>
        {errors.bio ? (
          <p className="text-destructive text-xs">{errors.bio}</p>
        ) : looksLikePlaceholder ? (
          <p className="text-warning text-xs">{BIO_PLACEHOLDER_ERROR}</p>
        ) : null}
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <Label>Professional photo</Label>
        <p className="text-muted-foreground text-xs">
          A clear, friendly photo helps families feel comfortable reaching out.
        </p>
        <PhotoUpload
          photos={values.photos}
          photoUrls={photoUrls}
          tier={tier}
          onChange={(photos) => onChange("photos", photos)}
          onPhotoResolved={(path, url) =>
            setUploadedUrls((prev) => ({ ...prev, [path]: url }))
          }
        />
        {errors.photos && (
          <p className="text-destructive text-xs">{errors.photos}</p>
        )}
        {/* Only once there is a photo to position, and only when its URL has
            arrived: a picker over a blank box would be a control with nothing
            to control. */}
        {firstPhotoUrl && (
          <div className="pt-2">
            <PhotoFocalPicker
              src={firstPhotoUrl}
              focal={{ x: values.photo_focal_x, y: values.photo_focal_y }}
              onChange={(focal) => {
                onChange("photo_focal_x", focal.x);
                onChange("photo_focal_y", focal.y);
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
