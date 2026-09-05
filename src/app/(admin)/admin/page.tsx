import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, MessageSquare, Flag, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminCounts } from "@/lib/admin/queries";
import { getDirectoryCoverage } from "@/lib/nurses/coverage";
import { DirectoryCoverage } from "./DirectoryCoverage";
import { getNudgeResponse } from "@/lib/nurses/nudge-response";
import { NudgeResponse } from "./NudgeResponse";

export const metadata: Metadata = {
  title: "Admin | NurseDex",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const [counts, coverage, nudges] = await Promise.all([
    getAdminCounts(),
    getDirectoryCoverage(),
    getNudgeResponse(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Admin
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          What needs your attention right now.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard
          href="/admin/verifications"
          icon={<ShieldCheck className="size-5" />}
          label="Pending verifications"
          count={counts.pendingVerifications}
        />
        <CountCard
          href="/admin/reviews"
          icon={<MessageSquare className="size-5" />}
          label="Pending reviews"
          count={counts.pendingReviews}
        />
        <CountCard
          href="/admin/disputes"
          icon={<Flag className="size-5" />}
          label="Disputes"
          count={counts.pendingDisputes}
        />
        <CountCard
          href="/admin/reviews?tab=removal-requests"
          icon={<Trash2 className="size-5" />}
          label="Removal requests"
          count={counts.removalRequests}
        />
      </div>

      <DirectoryCoverage coverage={coverage} />

      <NudgeResponse response={nudges} />
    </div>
  );
}

function CountCard({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link href={href} className="block">
      <Card className="border-sage/20 hover:border-teal/40 transition-colors">
        <CardContent className="space-y-1 pt-5">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            {icon}
            {label}
          </div>
          <p className="font-heading text-soft-black text-3xl font-semibold">
            {count}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
