import { BlogPostStatus } from "@/types/enums";

/**
 * Pure helpers for the blog post status state machine. These compute the
 * `status` + `publish_at` columns to write for each author action and
 * own the rules (a scheduled post must be in the future, a published
 * post is stamped with its publish time). Kept free of any Supabase or
 * Next wiring so the rules can be unit tested directly.
 */

export type StatusPatch = {
  status: BlogPostStatus;
  publish_at: string | null;
};

export type TransitionResult =
  | { ok: true; patch: StatusPatch }
  | { ok: false; error: string };

/** Save (or keep) a post as a draft. Clears any scheduled time. */
export function toDraft(): StatusPatch {
  return { status: BlogPostStatus.DRAFT, publish_at: null };
}

/** Publish immediately, stamping publish_at with the current time. */
export function toPublished(now: Date): StatusPatch {
  return { status: BlogPostStatus.PUBLISHED, publish_at: now.toISOString() };
}

/** Archive a post (hidden from the public index, kept in the admin list). */
export function toArchived(): StatusPatch {
  return { status: BlogPostStatus.ARCHIVED, publish_at: null };
}

/**
 * Schedule a post to publish at a future time. Rejects a time that is
 * missing, unparseable, or not in the future.
 */
export function toScheduled(
  publishAtIso: string | null | undefined,
  now: Date,
): TransitionResult {
  if (!publishAtIso) {
    return { ok: false, error: "Pick a date and time to schedule." };
  }
  const when = new Date(publishAtIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: "That is not a valid date and time." };
  }
  if (when.getTime() <= now.getTime()) {
    return { ok: false, error: "Scheduled time must be in the future." };
  }
  return {
    ok: true,
    patch: { status: BlogPostStatus.SCHEDULED, publish_at: when.toISOString() },
  };
}
