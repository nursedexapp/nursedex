import Link from "next/link";
import Image from "next/image";
import { Star, MapPin, User, Sparkles, Clock, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CREDENTIAL_LABELS, CARE_TYPE_LABELS } from "@/types/enums";
import type { Credential, CareType } from "@/types/enums";
import type { NurseSearchCard } from "@/lib/nurses/search";
import { SaveHeartButton } from "./SaveHeartButton";

interface NurseCardProps {
  nurse: NurseSearchCard;
  // When present, the heart button is shown (requires family auth upstream).
  saveState?: { isSaved: boolean };
  // Dim the card slightly to visually distinguish partial matches.
  dimmed?: boolean;
  // Anon survey-results mode: hide last name, suppress save button, no profile link.
  anonymousMode?: boolean;
  // Reveal the nurse's last name. Only true for viewers entitled to see it
  // (families with an active subscription, or already-revealed nurse lists).
  // Without it, the card shows the first name only.
  showLastName?: boolean;
  // In anonymousMode, show the hover/pointer affordance because an ancestor
  // (e.g. a dialog trigger) handles the click. Does not add a link itself.
  interactive?: boolean;
}

export function NurseCard({
  nurse,
  saveState,
  dimmed,
  anonymousMode,
  interactive,
  showLastName,
}: NurseCardProps) {
  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] ?? nurse.credential;
  const primaryCareLabel = nurse.primary_care_type
    ? (CARE_TYPE_LABELS[nurse.primary_care_type as CareType] ??
      nurse.primary_care_type)
    : nurse.care_types[0]
      ? (CARE_TYPE_LABELS[nurse.care_types[0] as CareType] ??
        nurse.care_types[0])
      : null;

  const showUnavailable = !nurse.is_available;
  const displayName =
    showLastName && !anonymousMode && nurse.last_name
      ? `${nurse.first_name} ${nurse.last_name}`
      : nurse.first_name;

  const inner = (
    <>
      {/* Photo area */}
      <div className="bg-sage/10 relative aspect-[16/10] w-full overflow-hidden">
        {nurse.photo_url ? (
          <Image
            src={nurse.photo_url}
            alt={`${displayName}, ${credentialLabel}`}
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="text-sage flex h-full items-center justify-center">
            <User className="size-12" aria-hidden="true" />
          </div>
        )}

        {/* Top-left: Featured / Unavailable badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {nurse.tier === "featured" && (
            <Badge className="bg-teal hover:bg-teal gap-1 text-white">
              <Sparkles className="size-3" aria-hidden="true" />
              Featured
            </Badge>
          )}
          {showUnavailable && (
            <Badge
              variant="outline"
              className="border-sage text-soft-black-light gap-1 bg-white/90"
            >
              <Clock className="size-3" aria-hidden="true" />
              Unavailable
            </Badge>
          )}
          {nurse.revealed && (
            <Badge
              variant="outline"
              className="border-teal/40 text-teal gap-1 bg-white/90"
            >
              <CircleCheck className="size-3" aria-hidden="true" />
              Revealed
            </Badge>
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-soft-black text-base font-medium">
            {displayName}
          </h3>
          {nurse.avg_rating !== null && nurse.review_count > 0 && (
            <div className="text-soft-black-light flex shrink-0 items-center gap-1 text-sm">
              <Star
                className="size-3.5 fill-amber-400 text-amber-400"
                aria-hidden="true"
              />
              <span>{nurse.avg_rating.toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">
                ({nurse.review_count})
              </span>
            </div>
          )}
        </div>

        <p className="text-soft-black-light text-sm">{credentialLabel}</p>

        {primaryCareLabel && (
          <p className="text-muted-foreground text-sm">{primaryCareLabel}</p>
        )}

        <div className="text-muted-foreground mt-auto flex items-center gap-3 pt-2 text-xs">
          {nurse.distance_miles !== null && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {nurse.distance_miles}{" "}
              {nurse.distance_miles === 1 ? "mile" : "miles"} away
            </span>
          )}
          {nurse.years_experience !== null && (
            <span className="inline-flex items-center gap-1">
              {nurse.years_experience} yrs exp.
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <article
      className={cn(
        "group border-sage/20 relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-shadow",
        (!anonymousMode || interactive) && "hover:shadow-md",
        dimmed && "opacity-80",
      )}
    >
      {anonymousMode ? (
        <div className="flex flex-1 flex-col">{inner}</div>
      ) : (
        <Link
          href={`/nurses/${nurse.slug}`}
          className="focus-visible:ring-teal flex flex-1 flex-col focus:outline-none focus-visible:ring-2"
        >
          {inner}
        </Link>
      )}

      {/* Save heart button (overlay, stops link propagation) */}
      {saveState && !anonymousMode && (
        <SaveHeartButton
          nurseUserId={nurse.user_id}
          initialIsSaved={saveState.isSaved}
          className="absolute top-2 right-2"
        />
      )}
    </article>
  );
}
