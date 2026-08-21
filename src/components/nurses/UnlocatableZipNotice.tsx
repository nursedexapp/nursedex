import { MapPinOff } from "lucide-react";

interface UnlocatableZipNoticeProps {
  // The zip we were asked to measure from and could not find. Null renders
  // nothing.
  zip: string | null;
  // Whether the family also asked for a radius. What we lost differs: with a
  // radius set, the constraint was ignored; without one, only the distances on
  // the cards are missing. The sentence is derived from that rather than
  // asserted, so it never claims a filter was dropped that nobody set.
  hadDistanceFilter: boolean;
}

/**
 * Says that a zip could not be located, rather than letting the page answer
 * with zero results for a reason no family could act on (#769).
 */
export function UnlocatableZipNotice({
  zip,
  hadDistanceFilter,
}: UnlocatableZipNoticeProps) {
  if (!zip) return null;

  return (
    <div
      role="status"
      className="border-amber-300/60 bg-amber-50 text-soft-black mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm"
    >
      <MapPinOff
        className="mt-0.5 size-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <p>
        We could not locate {zip}, so{" "}
        {hadDistanceFilter
          ? "we ignored the distance you chose and are showing every other match."
          : "the nurses below do not show how far away they are."}{" "}
        Check the zip code, or try a nearby one.
      </p>
    </div>
  );
}
