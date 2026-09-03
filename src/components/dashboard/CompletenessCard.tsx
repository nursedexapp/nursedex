import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { MissingItem } from "@/lib/profile/completeness";

interface CompletenessCardProps {
  score: number;
  missing: MissingItem[];
}

export function CompletenessCard({ score, missing }: CompletenessCardProps) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          How your profile is shaping up
        </CardTitle>
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
                    ? "text-success"
                    : score >= 50
                      ? "text-teal"
                      : "text-warning",
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
                A fuller profile ranks higher when families search:
              </p>
              {missing.slice(0, 3).map((item) => (
                <Link
                  key={item.label}
                  href="/dashboard/edit"
                  className="text-teal flex items-center gap-1 text-sm hover:underline"
                >
                  <ChevronRight className="size-3.5 shrink-0" />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground text-xs">
                    +{item.points}
                  </span>
                </Link>
              ))}
              {missing.length > 3 && (
                <p className="text-muted-foreground text-xs">
                  +{missing.length - 3} more
                </p>
              )}
            </div>
          ) : (
            <p className="text-success text-sm font-medium">
              Looking great. Your profile is fully filled in.
            </p>
          )}
        </div>

        {missing.length > 0 && (
          // Honest about the ceiling: a complete free profile still sits below
          // a Featured one, and promising otherwise would be selling her
          // something the ranking does not do.
          <p className="text-muted-foreground mt-4 text-xs">
            Featured nurses appear first whatever their profile. Among everyone
            else, the fuller your profile, the higher you appear.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
