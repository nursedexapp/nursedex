"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUpload } from "./PhotoUpload";
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
          placeholder="I have been a dedicated healthcare professional for over 10 years, specializing in elder care across Long Island. I treat every patient like family..."
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
        />
        {errors.photos && (
          <p className="text-destructive text-xs">{errors.photos}</p>
        )}
      </div>
    </>
  );
}
