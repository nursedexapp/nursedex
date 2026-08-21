import Link from "next/link";
import Image from "next/image";
import { Star, MapPin, Sparkles, Clock, CircleCheck, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NurseSearchCard } from "@/lib/nurses/card";
import { SaveHeartButton } from "./SaveHeartButton";
import {
  availabilityLabel,
  careTypeLabel,
  credentialLine,
  displayName,
  lockedFooterLabel,
  rateLabel,
  townLabel,
} from "./nurse-card-copy";

interface NurseCardProps {
  nurse: NurseSearchCard;
  // When present, the heart button is shown (requires family auth upstream).
  // inSavedOnlyView tells the heart that unsaving changes which cards belong
  // in this grid, not just how this one looks (#776).
  saveState?: { isSaved: boolean; inSavedOnlyView?: boolean };
  // Dim the card slightly to visually distinguish partial matches.
  dimmed?: boolean;
  // Anon survey-results mode: hide last name, suppress save button, no profile link.
  anonymousMode?: boolean;
  // Reveal the nurse's last name. Only true for viewers entitled to see it
  // (families with an active subscription, or already-revealed nurse lists).
  // Without it, the card shows the first name and last initial.
  showLastName?: boolean;
  // In anonymousMode, show the hover/pointer affordance because an ancestor
  // (e.g. a dialog trigger) handles the click. Does not add a link itself.
  interactive?: boolean;
}

/**
 * Every field on this card is missing on some real nurse, so each absent state
 * is designed rather than collapsed: no photo, no care type, no town, and
 * "not set" wording for rate and availability. Those sit at the 4.5:1 text
 * floor rather than the 3:1 icon floor, because they are text a family has to
 * read (#774).
 */
export function NurseCard({
  nurse,
  saveState,
  dimmed,
  anonymousMode,
  interactive,
  showLastName,
}: NurseCardProps) {
  const name = displayName(nurse, {
    showLastName: !!showLastName && !anonymousMode,
  });
  const credential = credentialLine(nurse);
  const careType = careTypeLabel(nurse);
  const town = townLabel(nurse);
  const showUnavailable = !nurse.is_available;

  // Signed out cards arrive with these blanked in the data, so the footer is
  // derived from the nurse's own record instead of from the missing values.
  const locked = lockedFooterLabel(nurse);
  const isLocked =
    nurse.rate_min === null &&
    nurse.rate_max === null &&
    nurse.availability_commitment.length === 0 &&
    locked !== null;

  const inner = (
    <>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Header: avatar, name, credential, rating */}
        <div className="flex items-start gap-3">
          <Avatar nurse={nurse} name={name} />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-heading text-soft-black truncate text-base font-medium">
                {name}
              </h3>
              {nurse.avg_rating !== null && nurse.review_count > 0 && (
                <span className="text-soft-black-light flex shrink-0 items-center gap-1 text-sm">
                  <Star
                    className="size-3.5 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  {nurse.avg_rating.toFixed(1)}
                  <span className="text-soft-black-light text-xs">
                    ({nurse.review_count})
                  </span>
                </span>
              )}
            </div>
            <p className="text-soft-black-light mt-0.5 text-sm">{credential}</p>
          </div>
        </div>

        {/* Badges and care type */}
        {(careType ||
          nurse.tier === "featured" ||
          showUnavailable ||
          nurse.revealed) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {careType && (
              <Badge
                variant="outline"
                className="border-sage bg-sage/15 text-soft-black font-normal"
              >
                {careType}
              </Badge>
            )}
            {nurse.tier === "featured" && (
              <Badge className="bg-teal hover:bg-teal gap-1 text-white">
                <Sparkles className="size-3" aria-hidden="true" />
                Featured
              </Badge>
            )}
            {showUnavailable && (
              <Badge
                variant="outline"
                className="border-sage text-soft-black-light gap-1 bg-white"
              >
                <Clock className="size-3" aria-hidden="true" />
                Unavailable
              </Badge>
            )}
            {nurse.revealed && (
              <Badge
                variant="outline"
                className="border-teal/40 text-teal gap-1 bg-white"
              >
                <CircleCheck className="size-3" aria-hidden="true" />
                Revealed
              </Badge>
            )}
          </div>
        )}

        {/* Town and distance */}
        {(town || nurse.distance_miles !== null) && (
          <p className="text-soft-black-light flex flex-wrap items-center gap-x-2 text-sm">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {town ?? "Town not listed"}
            </span>
            {nurse.distance_miles !== null && (
              <span>
                {nurse.distance_miles}{" "}
                {nurse.distance_miles === 1 ? "mile" : "miles"} away
              </span>
            )}
          </p>
        )}

        {/* Bio */}
        {nurse.bio && (
          <p
            className={cn(
              "text-soft-black-light text-sm",
              nurse.tier === "featured" ? "line-clamp-6" : "line-clamp-4",
            )}
          >
            {nurse.bio}
          </p>
        )}
      </div>

      {/* Footer: availability and rate */}
      <div className="border-sage/20 text-soft-black-light mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-3 text-sm">
        {isLocked ? (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            {locked}
          </span>
        ) : (
          <>
            <span className="truncate">{availabilityLabel(nurse)}</span>
            <span className="text-soft-black font-medium">
              {rateLabel(nurse)}
            </span>
          </>
        )}
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
          inSavedOnlyView={saveState.inSavedOnlyView}
          className="absolute top-3 right-3"
        />
      )}
    </article>
  );
}

/**
 * 52px round avatar, cropped to the upper third so a head sits in frame rather
 * than a chin. A nurse with no photo gets her initial, not an empty grey
 * circle: the card should still read as a person.
 */
function Avatar({ nurse, name }: { nurse: NurseSearchCard; name: string }) {
  const initial = nurse.first_name.charAt(0).toUpperCase();

  return (
    <div className="bg-sage-light relative size-13 shrink-0 overflow-hidden rounded-full">
      {nurse.photo_url ? (
        <Image
          src={nurse.photo_url}
          alt={name}
          fill
          sizes="52px"
          className="object-cover object-[50%_25%]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-heading text-soft-black flex h-full w-full items-center justify-center text-lg font-medium"
        >
          {initial}
        </span>
      )}
    </div>
  );
}
