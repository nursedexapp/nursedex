import Link from "next/link";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdminReviewRow } from "@/lib/admin/queries";

interface AdminReviewCardProps {
  row: AdminReviewRow;
  showRemovalReason?: boolean;
  showDisputeDetails?: boolean;
  actions?: React.ReactNode;
}

export function AdminReviewCard({
  row,
  showRemovalReason,
  showDisputeDetails,
  actions,
}: AdminReviewCardProps) {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-2 pt-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={row.rating} />
            <span className="text-sm font-medium">{row.reviewer_name}</span>
            {row.is_external && (
              <Badge
                variant="outline"
                className="border-sage/30 bg-sage/5 text-[10px]"
              >
                External
              </Badge>
            )}
            <Link
              href={`/nurses/${row.nurse_slug}`}
              target="_blank"
              rel="noopener"
              className="text-muted-foreground hover:text-teal text-xs hover:underline"
            >
              for {row.nurse_first_name} {row.nurse_last_name} ↗
            </Link>
          </div>
          <time className="text-muted-foreground text-xs">
            {new Date(row.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </header>

        {row.text && (
          <p className="text-soft-black text-sm whitespace-pre-line">
            {row.text}
          </p>
        )}

        {showRemovalReason && row.removal_reason && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="text-[11px] font-medium">
              Removal reason from family
            </p>
            <p className="mt-1 text-sm">{row.removal_reason}</p>
          </div>
        )}

        {showDisputeDetails && (row.dispute_reason || row.dispute_text) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="text-[11px] font-medium">
              Dispute from {row.nurse_first_name}
              {row.dispute_reason ? ` — ${row.dispute_reason}` : ""}
            </p>
            {row.dispute_text && (
              <p className="mt-1 text-sm whitespace-pre-line">
                {row.dispute_text}
              </p>
            )}
          </div>
        )}

        {actions && <div className="pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating
              ? "size-4 fill-amber-400 text-amber-400"
              : "text-muted-foreground/40 size-4"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
