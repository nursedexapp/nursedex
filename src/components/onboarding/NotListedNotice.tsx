import { EyeOff } from "lucide-react";
import { listingGaps } from "@/lib/nurses/listing";

interface NotListedNoticeProps {
  verificationStatus: string;
  hasPhoto: boolean;
  bio: string | null;
  careTypes: string[] | null;
}

/**
 * Says, on every step of the wizard, that a verified nurse is not in the
 * directory yet and what is keeping her out (#732, #940).
 *
 * This is where the nurses it concerns actually are. The dashboard has the
 * same state, but a nurse whose profile is unfinished has not finished
 * onboarding, so the dashboard redirects her here before that state renders.
 *
 * It reads the same listingGaps the directory queries with, rather than
 * re-stating the condition, so the sentence cannot start disagreeing with who
 * is actually listed, and cannot tell a nurse who has just added a photo that
 * her profile has no photo. It stays silent for a nurse who is still pending:
 * she is missing from the directory for a different reason and telling her
 * this one would be wrong.
 */
export function NotListedNotice({
  verificationStatus,
  hasPhoto,
  bio,
  careTypes,
}: NotListedNoticeProps) {
  if (verificationStatus !== "verified") return null;

  const gaps = listingGaps({
    has_photo: hasPhoto,
    bio,
    care_types: careTypes,
  });
  if (gaps.length === 0) return null;

  return (
    <div className="border-warning/30 bg-warning/5 mb-5 flex items-start gap-3 rounded-lg border p-4">
      <EyeOff
        className="text-warning mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <div>
        <p className="text-soft-black font-body text-sm font-semibold">
          You&apos;re verified, but families cannot see you yet
        </p>
        <p className="text-soft-black-light font-body mt-1 text-sm">
          Your profile does not appear in the directory yet. Families choose by
          what they can see, and search by the care they need.
        </p>
        <ul className="text-soft-black-light font-body mt-2 list-disc space-y-1 pl-5 text-sm">
          {gaps.includes("content") && (
            <li>Add a photo or a short bio, either one is enough.</li>
          )}
          {gaps.includes("care_type") && (
            <li>
              Say what type of care you provide, so families searching for it
              find you.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
