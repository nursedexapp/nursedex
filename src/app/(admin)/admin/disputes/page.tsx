import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { getDisputedReviews } from "@/lib/admin/queries";
import { AdminReviewCard } from "@/components/admin/AdminReviewCard";
import { DisputeDecisionDialog } from "@/components/admin/DisputeDecisionDialog";

export const metadata: Metadata = {
  title: "Disputes | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDisputesPage() {
  const rows = await getDisputedReviews();

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Disputes
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Reviews the nurse has flagged. Disputed reviews stay public with an
          &quot;Under review&quot; badge until you decide. Both parties get an
          email when the case closes.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="border-sage/20">
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No active disputes.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <AdminReviewCard
              key={row.id}
              row={row}
              showDisputeDetails
              actions={
                <div className="flex items-center gap-2">
                  <DisputeDecisionDialog
                    reviewId={row.id}
                    decision="keep"
                    triggerLabel="Keep review"
                    triggerVariant="default"
                  />
                  <DisputeDecisionDialog
                    reviewId={row.id}
                    decision="remove"
                    triggerLabel="Remove review"
                    triggerVariant="destructive"
                  />
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
