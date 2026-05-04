import type { Metadata } from "next";
import {
  Users,
  ShieldCheck,
  Eye,
  Heart,
  Star,
  DollarSign,
  Briefcase,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/helpers";
import { Card, CardContent } from "@/components/ui/card";
import { getAnalyticsTotals } from "@/lib/admin/analytics";
import { PRICING } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Analytics | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage() {
  await requireSuperAdmin();
  const t = await getAnalyticsTotals();

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Analytics
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Super admin only. Counts live, MRR computed at published prices ($
          {PRICING.NURSE_FEATURED_MONTHLY} Featured, $
          {PRICING.FAMILY_ACCESS_MONTHLY} Family Access).
        </p>
      </header>

      <Section title="Signups">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={<Users className="size-4" />}
            label="Total signups"
            value={t.signups.total}
            sub={`${t.signups.nurse} nurses, ${t.signups.family} families`}
          />
          <Stat
            icon={<Users className="size-4" />}
            label="New, last 7 days"
            value={t.newSignupsLast7d}
          />
          <Stat
            icon={<Users className="size-4" />}
            label="New, last 30 days"
            value={t.newSignupsLast30d}
          />
        </div>
      </Section>

      <Section title="Revenue">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={<DollarSign className="size-4" />}
            label="MRR"
            value={`$${t.mrr.toFixed(2)}`}
          />
          <Stat
            icon={<Star className="size-4" />}
            label="Active Featured nurses"
            value={t.activeFeatured}
          />
          <Stat
            icon={<Star className="size-4" />}
            label="Active Family Access"
            value={t.activeFamilyAccess}
          />
        </div>
      </Section>

      <Section title="Engagement">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={<Eye className="size-4" />}
            label="Total reveals"
            value={t.totalReveals}
            sub={`${t.revealsLast30d} in the last 30 days`}
          />
          <Stat
            icon={<Heart className="size-4" />}
            label="Total saves"
            value={t.totalSaves}
          />
          <Stat
            icon={<Briefcase className="size-4" />}
            label="Hires recorded"
            value={t.totalHires}
          />
        </div>
      </Section>

      <Section title="Operations">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            icon={<ShieldCheck className="size-4" />}
            label="Pending verifications"
            value={t.pendingVerifications}
          />
          <Stat
            icon={<Star className="size-4" />}
            label="Approved reviews"
            value={t.totalReviewsApproved}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-soft-black mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-1 pt-4">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {icon}
          {label}
        </div>
        <p className="font-heading text-soft-black text-2xl font-semibold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </CardContent>
    </Card>
  );
}
