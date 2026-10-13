import { Cookie } from "lucide-react";
import { consentNoteText, type ConsentTally } from "@/lib/admin/consent-tally";
import { Section, Stat } from "./analytics-parts";

export function ConsentSection({ consent }: { consent: ConsentTally }) {
  return (
    <Section title="Cookie banner, last 30 days">
      {consent.status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {consent.message}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              icon={<Cookie className="size-4" />}
              label="Browsers shown"
              value={consent.shown}
            />
            <Stat
              icon={<Cookie className="size-4" />}
              label="Accepted"
              value={consent.accepted}
            />
            <Stat
              icon={<Cookie className="size-4" />}
              label="Declined"
              value={consent.declined}
            />
          </div>
          <p className="text-soft-black-light mt-3 text-sm">
            {consentNoteText(consent)}
          </p>
        </>
      )}
    </Section>
  );
}
