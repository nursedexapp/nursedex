import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface CompletenessCardProps {
  score: number;
  missing: string[];
}

export function CompletenessCard({ score, missing }: CompletenessCardProps) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">How your profile is shaping up</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Progress ring */}
          <div className="relative shrink-0">
            <svg className="size-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-sage/20"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className={cn(
                  "transition-all duration-500",
                  score >= 80
                    ? "text-emerald-500"
                    : score >= 50
                      ? "text-teal"
                      : "text-amber-500",
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold">
              {score}%
            </span>
          </div>

          {/* Missing fields */}
          {missing.length > 0 ? (
            <div className="flex-1 space-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                Add these so families can find a fuller picture of you:
              </p>
              {missing.slice(0, 3).map((item) => (
                <Link
                  key={item}
                  href="/dashboard/edit"
                  className="text-teal flex items-center gap-1 text-sm hover:underline"
                >
                  <ChevronRight className="size-3.5" />
                  {item}
                </Link>
              ))}
              {missing.length > 3 && (
                <p className="text-muted-foreground text-xs">
                  +{missing.length - 3} more
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium text-emerald-600">
              Looking great. Your profile is fully filled in.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
