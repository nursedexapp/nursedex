import { ClipboardList } from "lucide-react";

interface SentBackNoticeProps {
  /** Whether the nurse arrived here from a page that refused to render. */
  sentBack: boolean;
}

/**
 * Explains the redirect (#905).
 *
 * /dashboard, /dashboard/edit and /dashboard/preview all send a nurse whose
 * profile is unfinished into this wizard. She pressed nothing to cause it, so
 * without this she asks for her dashboard and simply gets a form, with no way
 * to tell a refusal from a broken link. 24 verified nurses were in exactly
 * that position when this was measured on 2026-09-03.
 *
 * It says nothing about WHICH field is missing, because the step she lands on
 * shows that against the control itself.
 */
export function SentBackNotice({ sentBack }: SentBackNoticeProps) {
  if (!sentBack) return null;

  return (
    <div
      role="status"
      className="border-sage/40 bg-sage/10 mb-5 flex items-start gap-3 rounded-lg border p-4"
    >
      <ClipboardList
        className="text-teal mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <div>
        <p className="text-soft-black font-body text-sm font-semibold">
          A few details are still missing
        </p>
        <p className="text-soft-black-light font-body mt-1 text-sm">
          Your dashboard opens once your profile is finished. This is the step
          that still needs something.
        </p>
      </div>
    </div>
  );
}
