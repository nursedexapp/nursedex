import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, BarChart3, Zap } from "lucide-react";

const BENEFITS = [
  { icon: Search, text: "Top placement in search results" },
  { icon: Sparkles, text: "Featured badge on your profile" },
  { icon: BarChart3, text: "Analytics dashboard (views, saves, reveals)" },
  { icon: Zap, text: "Priority 24-hour verification" },
];

export function FeaturedUpsell() {
  return (
    <Card className="border-teal/20 bg-gradient-to-br from-teal/5 to-sage/10">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Badge className="bg-teal text-white">Featured</Badge>
          <span className="text-sm font-medium">$29/month</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Stand out to families and grow your client base.
        </p>
        <ul className="mt-3 space-y-2">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm">
              <Icon className="size-4 text-teal" />
              {text}
            </li>
          ))}
        </ul>
        <button
          disabled
          className="mt-4 w-full rounded-lg bg-teal/10 px-4 py-2 text-sm font-medium text-teal opacity-60"
        >
          Upgrade coming soon
        </button>
      </CardContent>
    </Card>
  );
}
