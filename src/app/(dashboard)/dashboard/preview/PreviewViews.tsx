"use client";

import { useState } from "react";
import { NurseProfilePublic } from "@/components/profile/NurseProfilePublic";
import type { PublicNurseProfile } from "@/lib/profile/queries";
import { cn } from "@/lib/utils";

type ViewerKind = "visitor" | "subscribed";

/**
 * A nurse's own profile, shown as the two kinds of family actually see it
 * (#447).
 *
 * Both are offered rather than only the gated one, because a nurse has a real
 * reason to check each: what a stranger can see is the privacy question, and
 * what a paying family gets is the question about whether the profile is worth
 * paying for. Showing only one would answer half of it.
 *
 * Which view is on screen is stated in words rather than left to be inferred
 * from a missing surname, since the whole defect being fixed here was a
 * confident banner over the wrong view.
 */
export function PreviewViews({
  visitor,
  subscribed,
  photoUrl,
  licenseVerifyUrl,
  hasLicenseNumber,
}: {
  visitor: PublicNurseProfile;
  subscribed: PublicNurseProfile;
  photoUrl: string | null;
  licenseVerifyUrl: string | null;
  hasLicenseNumber: boolean;
}) {
  const [viewer, setViewer] = useState<ViewerKind>("visitor");

  const options: { kind: ViewerKind; label: string; caption: string }[] = [
    {
      kind: "visitor",
      label: "Anyone browsing",
      caption:
        "What a visitor who has not subscribed sees. Your surname and licence number are withheld, and your contact details are locked.",
    },
    {
      kind: "subscribed",
      label: "A family who has subscribed",
      caption:
        "What a family sees after they subscribe and unlock you. Your full name, licence number and contact details are shown.",
    },
  ];

  const current = options.find((option) => option.kind === viewer)!;

  return (
    <div className="space-y-4">
      <div
        className="border-sage/20 flex flex-wrap gap-2 rounded-lg border p-1"
        role="group"
        aria-label="Choose whose view to preview"
      >
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => setViewer(option.kind)}
            aria-pressed={viewer === option.kind}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              viewer === option.kind
                ? "bg-teal text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-muted-foreground text-sm">{current.caption}</p>

      {viewer === "visitor" ? (
        <NurseProfilePublic
          nurse={visitor}
          photoUrl={photoUrl}
          licenseVerifyUrl={licenseVerifyUrl}
          distanceMiles={null}
          viewMode="free"
          revealMode="anon"
          canSeeIdentity={false}
          hasLicenseNumber={hasLicenseNumber}
        />
      ) : (
        <NurseProfilePublic
          nurse={subscribed}
          photoUrl={photoUrl}
          licenseVerifyUrl={licenseVerifyUrl}
          distanceMiles={null}
          viewMode="subscribed"
          revealMode={null}
          canSeeIdentity
          hasLicenseNumber={hasLicenseNumber}
        />
      )}
    </div>
  );
}
