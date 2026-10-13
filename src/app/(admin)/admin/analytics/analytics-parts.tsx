import { Card, CardContent } from "@/components/ui/card";

export function Section({
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

export function Stat({
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
