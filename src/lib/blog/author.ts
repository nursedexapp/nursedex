/**
 * Build a display name for a blog author from their user record. Returns
 * null when no usable name exists (so callers can fall back to the org
 * byline). Pure, so it is unit testable.
 */
export function authorDisplayName(
  user: { first_name: string | null; last_name: string | null } | null,
): string | null {
  if (!user) return null;
  const name = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}
