import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getPendingReviews,
  getRemovalRequests,
  getFlaggedNurses,
} from "@/lib/admin/queries";
import { AdminReviewCard } from "@/components/admin/AdminReviewCard";
import {
  PendingReviewActions,
  RemovalRequestActions,
} from "@/components/admin/ReviewActionButtons";

export const metadata: Metadata = {
  title: "Reviews | NurseDex Admin",
  robots: { index: false, follow: false },
};

interface ReviewsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminReviewsPage({
  searchParams,
}: ReviewsPageProps) {
  const { tab } = await searchParams;
  const active =
    tab === "removal-requests"
      ? "removal-requests"
      : tab === "flagged"
        ? "flagged"
        : "pending";

  const [pending, removals, flagged] = await Promise.all([
    getPendingReviews(),
    getRemovalRequests(),
    getFlaggedNurses(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-4">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Reviews
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Moderation queue, family removal requests, and flagged nurses.
        </p>
      </header>

      <nav className="border-sage/20 mb-6 flex items-center gap-1 border-b text-sm">
        <Tab
          href="/admin/reviews"
          label="Pending"
          count={pending.length}
          active={active === "pending"}
        />
        <Tab
          href="/admin/reviews?tab=removal-requests"
          label="Removal requests"
          count={removals.length}
          active={active === "removal-requests"}
        />
        <Tab
          href="/admin/reviews?tab=flagged"
          label="Flagged nurses"
          count={flagged.length}
          active={active === "flagged"}
        />
      </nav>

      {active === "pending" && (
        <Section
          empty="Inbox zero. No reviews waiting on moderation."
          rows={pending.map((r) => (
            <AdminReviewCard
              key={r.id}
              row={r}
              actions={<PendingReviewActions reviewId={r.id} />}
            />
          ))}
        />
      )}

      {active === "removal-requests" && (
        <Section
          empty="No removal requests right now."
          rows={removals.map((r) => (
            <AdminReviewCard
              key={r.id}
              row={r}
              showRemovalReason
              actions={<RemovalRequestActions reviewId={r.id} />}
            />
          ))}
        />
      )}

      {active === "flagged" && (
        <FlaggedNurses rows={flagged} />
      )}
    </div>
  );
}

function Tab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
        active
          ? "border-teal text-teal-dark font-medium"
          : "text-muted-foreground hover:text-foreground border-transparent"
      }`}
    >
      {label}
      <Badge variant="outline" className="text-[10px]">
        {count}
      </Badge>
    </Link>
  );
}

function Section({
  rows,
  empty,
}: {
  rows: React.ReactNode[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="border-sage/20">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          {empty}
        </CardContent>
      </Card>
    );
  }
  return <div className="space-y-3">{rows}</div>;
}

function FlaggedNurses({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getFlaggedNurses>>;
}) {
  if (rows.length === 0) {
    return (
      <Card className="border-sage/20">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          No nurses with multiple low ratings right now.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((nurse) => (
        <Card key={nurse.user_id} className="border-sage/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div>
              <Link
                href={`/nurses/${nurse.slug}`}
                target="_blank"
                rel="noopener"
                className="text-teal font-medium hover:underline"
              >
                {nurse.first_name} {nurse.last_name} ↗
              </Link>
              <p className="text-muted-foreground text-xs">
                {nurse.bad_review_count} low rated reviews
                {nurse.avg_rating !== null
                  ? ` · ${nurse.avg_rating} avg`
                  : ""}
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-900"
            >
              {nurse.bad_review_count} bad reviews
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
