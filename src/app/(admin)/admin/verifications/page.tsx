import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVerificationQueue } from "@/lib/admin/queries";
import { VerificationRowActions } from "@/components/admin/VerificationRowActions";
import { SLA_HOURS, getSlaState, type SlaState } from "@/lib/admin/sla";
import { CREDENTIAL_LABELS } from "@/types/enums";
import type { Credential } from "@/types/enums";

export const metadata: Metadata = {
  title: "Verifications | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function VerificationsPage() {
  const queue = await getVerificationQueue();

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Verifications
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Featured nurses get a 24 hour turnaround, free nurses 72 hours.
          Featured rows are sorted to the top automatically.
        </p>
      </header>

      {queue.length === 0 ? (
        <Card className="border-sage/20">
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Inbox zero. No verifications pending right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((row) => {
            const credLabel =
              CREDENTIAL_LABELS[row.credential as Credential] ?? row.credential;
            const slaHours = SLA_HOURS[row.tier];
            const submittedHrsAgo = hoursSince(row.submitted_at);
            const slaState = getSlaState(submittedHrsAgo, slaHours);

            return (
              <Card key={row.user_id} className="border-sage/20">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-heading text-base font-semibold">
                          {row.first_name} {row.last_name}
                        </h2>
                        {row.tier === "featured" && (
                          <Badge className="bg-teal text-white">Featured</Badge>
                        )}
                        {row.is_resubmission && (
                          <Badge variant="outline">Resubmission</Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={slaBadgeClass(slaState)}
                        >
                          {slaLabel(submittedHrsAgo, slaState)}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {credLabel}
                        {row.license_number ? ` · ${row.license_number}` : ""}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/nurses/${row.slug}`}
                        target="_blank"
                        rel="noopener"
                        className="text-teal text-sm hover:underline"
                      >
                        View profile ↗
                      </Link>
                      <VerificationRowActions
                        userId={row.user_id}
                        nurseFirstName={row.first_name ?? "this nurse"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function hoursSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
}

function slaBadgeClass(state: SlaState): string {
  if (state === "overdue") return "border-red-300 bg-red-50 text-red-900";
  if (state === "approaching")
    return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sage/30 bg-sage/5 text-sage-dark";
}
function slaLabel(hours: number, state: SlaState): string {
  const hLabel = hours < 1 ? "<1h" : `${hours}h`;
  if (state === "overdue") return `Overdue (${hLabel} ago)`;
  return `${hLabel} ago`;
}
