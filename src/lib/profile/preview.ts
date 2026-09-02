import { redactNurseIdentity } from "./identity";
import type { PublicNurseProfile } from "./queries";
import type { User } from "@/types/database";

export interface PreviewViews {
  /** What a signed-out visitor sees: no surname, no licence, no contact. */
  visitor: PublicNurseProfile;
  /** What a family with a subscription sees, contact details included. */
  subscribed: PublicNurseProfile;
  /** Whether a licence is on file, so the visitor view can say so. */
  hasLicenseNumber: boolean;
}

/**
 * The two views a nurse's own profile has, for the preview page (#447).
 *
 * The preview used to render a component nobody else used, showing the real
 * licence number and full surname with no contact gating, under a banner
 * saying "this is how families will see your profile". A nurse could
 * reasonably conclude their licence number was public. It was not: the public
 * page blanks the surname and hides the licence behind a subscription.
 *
 * Both views are built here, from one record, through the SAME redaction the
 * public page uses. That is the point: the previous arrangement was two
 * renderers that were free to drift, and they had.
 *
 * `redactNurseIdentity` edits IN PLACE, so each view gets its own copy. Handing
 * it the caller's object would blank the surname for both, and the subscribed
 * view would quietly become a second copy of the visitor one, which is the
 * failure this whole function exists to stop.
 */
export function buildPreviewViews(
  nurse: PublicNurseProfile,
  user: Pick<User, "email" | "phone" | "communication_preference">,
): PreviewViews {
  const subscribed: PublicNurseProfile = {
    ...nurse,
    // A revealed family sees the contact triple. It lives on the user record,
    // which is why the public query leaves these null and fills them in
    // separately once a reveal has happened.
    contact_email: user.email ?? null,
    contact_phone: user.phone ?? null,
    communication_preference: user.communication_preference ?? null,
  };

  const visitor: PublicNurseProfile = {
    ...nurse,
    contact_email: null,
    contact_phone: null,
    communication_preference: null,
  };
  const { hasLicenseNumber } = redactNurseIdentity(visitor, false);

  return { visitor, subscribed, hasLicenseNumber };
}
