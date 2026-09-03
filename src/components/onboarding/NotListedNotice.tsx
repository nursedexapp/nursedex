import { EyeOff } from "lucide-react";
import { isListed } from "@/lib/nurses/listing";

interface NotListedNoticeProps {
  verificationStatus: string;
  hasPhoto: boolean;
  bio: string | null;
}

/**
 * Says, on the bio and photos step, that a verified nurse is not in the
 * directory yet and why (#732).
 *
 * This is where the 40 nurses it concerns actually are. The dashboard has the
 * same state, but a nurse with neither a photo nor a bio has not finished
 * onboarding, so the dashboard redirects her here before that state renders.
 *
 * It reads the same isListed rule the directory queries with, rather than
 * re-stating the condition, so the sentence cannot start disagreeing with who
 * is actually listed. It stays silent for a nurse who is still pending: she is
 * missing from the directory for a different reason and telling her this one
 * would be wrong.
 */
export function NotListedNotice({
  verificationStatus,
  hasPhoto,
  bio,
}: NotListedNoticeProps) {
  if (verificationStatus !== "verified") return null;
  if (isListed({ has_photo: hasPhoto, bio })) return null;

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
          Your profile has no photo and no bio, so it does not appear in the
          directory. Add either one below and save, and you will show up
          straight away.
        </p>
      </div>
    </div>
  );
}
