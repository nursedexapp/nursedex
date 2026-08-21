import Link from "next/link";
import { Heart } from "lucide-react";

interface SavedListUnavailableNoticeProps {
  /** True only when the family asked for Saved only AND we could not read it. */
  show: boolean;
  /** The URL that keeps every other filter and drops Saved only. */
  withoutSavedHref: string;
}

/**
 * Says that the Saved only filter was not applied.
 *
 * Reading a family's saved list can fail, and when it does the search runs
 * without the constraint. Silently showing every nurse under a filter the
 * family switched on is the wrong answer; so is erroring the whole directory
 * over a list they may not even be filtering by. This is the third option:
 * show the results, say what was not applied, and offer the way out (#776).
 */
export function SavedListUnavailableNotice({
  show,
  withoutSavedHref,
}: SavedListUnavailableNoticeProps) {
  if (!show) return null;

  return (
    <div
      role="status"
      className="text-soft-black mb-6 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm"
    >
      <Heart
        className="mt-0.5 size-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <p>
        We could not load your saved list just now, so these results are not
        limited to nurses you saved. Try again in a moment, or{" "}
        <Link
          href={withoutSavedHref}
          className="text-teal underline underline-offset-2"
        >
          browse everyone
        </Link>
        .
      </p>
    </div>
  );
}
