/**
 * Identity gating for nurse profiles.
 *
 * A nurse's last name and license number are only shown to viewers who are
 * entitled to them: admins, the nurse themselves, and families with an active
 * subscription. A family in the post-cancellation grace window keeps access to
 * nurses they already revealed, so an existing reveal also unlocks identity for
 * that nurse. Everyone else (anonymous visitors, families without a
 * subscription, other nurses) sees the first name only with the license number
 * masked.
 */

export interface IdentityViewer {
  /** The viewer's role, if signed in. */
  role?: string | null;
  /** The viewer's user id, if signed in. */
  viewerId?: string | null;
  /** Whether the viewer has an active Family Access subscription. */
  hasSubscription?: boolean;
  /** Whether the viewer has already revealed this specific nurse. */
  hasReveal?: boolean;
}

/**
 * Whether the viewer may see the nurse's identity (last name + license number).
 */
export function canSeeNurseIdentity(
  nurseUserId: string,
  viewer: IdentityViewer,
): boolean {
  const isAdmin = viewer.role === "admin" || viewer.role === "super_admin";
  const isSelf = !!viewer.viewerId && viewer.viewerId === nurseUserId;
  return (
    isAdmin || isSelf || Boolean(viewer.hasSubscription) || Boolean(viewer.hasReveal)
  );
}

/**
 * Redact the identity fields on a nurse record in place when the viewer isn't
 * entitled to them. Returns whether the nurse has a license number on file
 * (captured before redaction) so the License Information section can still
 * render a "subscribe to unlock" hint without exposing the number itself.
 */
export function redactNurseIdentity<
  T extends { last_name: string; license_number: string | null },
>(nurse: T, canSeeIdentity: boolean): { hasLicenseNumber: boolean } {
  const hasLicenseNumber = !!nurse.license_number;
  if (!canSeeIdentity) {
    nurse.last_name = "";
    nurse.license_number = null;
  }
  return { hasLicenseNumber };
}

/**
 * Title for a public nurse profile (browser tab, social share cards). Crawler-
 * visible and not gated per-viewer, so it uses the first name only.
 */
export function publicNurseMetaTitle(
  firstName: string,
  credentialLabel: string,
): string {
  return `${firstName}, ${credentialLabel} | NurseDex`;
}

/**
 * Meta description for a public nurse profile. Falls back to a generated
 * sentence when the nurse has no bio. First name only, for the same reason as
 * the title.
 */
export function publicNurseMetaDescription(
  firstName: string,
  credentialLabel: string,
  bio: string | null,
): string {
  return bio
    ? bio.slice(0, 160)
    : `${firstName} is a ${credentialLabel} on NurseDex, New York's trusted nurse directory.`;
}
