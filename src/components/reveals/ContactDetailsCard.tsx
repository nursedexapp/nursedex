import { Card, CardContent } from "@/components/ui/card";
import { BLOCK_PII } from "@/components/ui/private";
import { Mail, Phone, MessageSquare } from "lucide-react";
import { COMMUNICATION_PREFERENCE_LABELS } from "@/types/enums";
import type { CommunicationPreference } from "@/types/enums";

/** The contact triple, exactly as revealNurse and getNurseContactInfo hand it over. */
export interface RevealedContact {
  email: string | null;
  phone: string | null;
  communication_preference: string | null;
}

/**
 * A revealed nurse's contact details.
 *
 * Two callers render this, and that is the point (#831). The profile page
 * server-renders it for a family who has already revealed this nurse, and
 * ContactReveal renders it in the browser the moment the reveal action hands
 * the contact back, without waiting for a server re-render that can lose the
 * race. One copy of the markup, so the two paths cannot drift apart.
 */
export function ContactDetailsCard({ contact }: { contact: RevealedContact }) {
  const prefLabel = contact.communication_preference
    ? COMMUNICATION_PREFERENCE_LABELS[
        contact.communication_preference as CommunicationPreference
      ]
    : null;

  return (
    <Card className="border-sage/20">
      <CardContent className="pt-4">
        <h2 className="mb-3 text-base font-semibold">Contact Information</h2>
        {/* BLOCK, not mask (#379). This is the nurse's real phone number and
            email, the thing a family pays to unlock, and it does not only
            appear as text: it is inside href="mailto:..." and href="tel:...".
            Session replay records attributes too, so masking the text would
            leave both sitting in plain sight in the link targets. Blocking
            drops the element from the recording entirely. */}
        <div className={`space-y-3 text-base ${BLOCK_PII}`}>
          {contact.email && (
            <a
              href={`mailto:${contact.email}?subject=NurseDex%20Inquiry`}
              className="text-teal flex items-center gap-2 hover:underline"
            >
              <Mail className="size-4" />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <>
              <a
                href={`tel:${contact.phone}`}
                className="text-teal flex items-center gap-2 hover:underline"
              >
                <Phone className="size-4" />
                Call {contact.phone}
              </a>
              <a
                href={`sms:${contact.phone}`}
                className="text-teal flex items-center gap-2 hover:underline"
              >
                <MessageSquare className="size-4" />
                Text {contact.phone}
              </a>
            </>
          )}
          {prefLabel && (
            <div className="text-muted-foreground flex items-center gap-2">
              <MessageSquare className="size-4" />
              Prefers contact by {prefLabel.toLowerCase()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
